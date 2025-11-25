use futures_util::{SinkExt, StreamExt};
use once_cell::sync::OnceCell;
use serde::Deserialize;
use serde_json::{Value, json};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex};
use tokio_tungstenite::{WebSocketStream, accept_async};
use tokio_tungstenite::tungstenite::Message;

use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri::async_runtime::JoinHandle;

use crate::downloader::get_queue_status;

pub type RemoteEmitter = Arc<dyn Fn(&str, Value) + Send + Sync + 'static>;
pub type RemoteEval = Arc<dyn Fn(&str) -> Result<(), String> + Send + Sync + 'static>;

// Broadcast channel used to push app events back to remote test clients.
static REMOTE_BROADCAST: OnceCell<broadcast::Sender<String>> = OnceCell::new();

/// Publish an event to any connected remote clients (best-effort, no-op if remote WS disabled).
pub fn broadcast_remote_event(event: &str, payload: Value) {
    if let Some(tx) = REMOTE_BROADCAST.get() {
        let _ = tx.send(json!({ "event": event, "payload": payload }).to_string());
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteCommand {
    action: String,
    url: Option<String>,
}

type WsStream = WebSocketStream<tokio::net::TcpStream>;
type WsSink = futures_util::stream::SplitSink<WsStream, Message>;
type WsSource = futures_util::stream::SplitStream<WsStream>;

async fn handle_socket(
    mut rx: WsSource,
    tx: Arc<Mutex<WsSink>>,
    emitter: RemoteEmitter,
    eval: RemoteEval,
) {
    while let Some(msg) = rx.next().await {
        let Ok(msg) = msg else {
            break;
        };

        if !msg.is_text() {
            continue;
        }

        let text = msg.into_text().unwrap_or_default();
        let cmd: RemoteCommand = match serde_json::from_str(&text) {
            Ok(c) => c,
            Err(e) => {
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(format!(r#"{{"ok":false,"error":"bad command: {e}"}}"#)))
                    .await;
                continue;
            }
        };

        match cmd.action.as_str() {
            "addUrl" => {
                if let Some(url) = cmd.url {
                    emitter("remote-add-url", Value::String(url.clone()));
                    let _ = tx.lock().await.send(Message::Text(r#"{"ok":true,"action":"addUrl"}"#.to_string())).await;
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(r#"{"ok":false,"error":"url required","action":"addUrl"}"#.to_string()))
                        .await;
                }
            }
            "startDownloads" => {
                emitter("remote-start-downloads", Value::Null);
                let _ = tx.lock().await.send(Message::Text(r#"{"ok":true,"action":"startDownloads"}"#.to_string())).await;
            }
            "cancelAll" => {
                emitter("remote-cancel-downloads", Value::Null);
                let _ = tx.lock().await.send(Message::Text(r#"{"ok":true,"action":"cancelAll"}"#.to_string())).await;
            }
            "status" => {
                let status = get_queue_status();
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(format!(
                        r#"{{"ok":true,"action":"status","queued":{},"active":{},"max":{}}}"#,
                        status.0, status.1, status.2
                    )))
                    .await;
            }
            "runJs" => {
                if let Some(script) = cmd.url {
                    match eval(script.as_str()) {
                        Ok(_) => {
                            let _ = tx
                                .lock()
                                .await
                                .send(Message::Text(r#"{"ok":true,"action":"runJs"}"#.to_string()))
                                .await;
                        }
                        Err(e) => {
                            let _ = tx
                                .lock()
                                .await
                                .send(Message::Text(format!(
                                    r#"{{"ok":false,"action":"runJs","error":"{}"}}"#,
                                    e
                                )))
                                .await;
                        }
                    }
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"action":"runJs","error":"script required"}"#.to_string(),
                        ))
                        .await;
                }
            }
            _ => {
                let _ = tx.lock().await.send(Message::Text(r#"{"ok":false,"error":"unknown action"}"#.to_string())).await;
            }
        }
    }
}

/// Start a websocket server on the given address with a provided emitter (used by app and tests).
pub fn start_remote_control_on(addr: SocketAddr, emitter: RemoteEmitter, eval: RemoteEval) -> JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let tx_broadcast = REMOTE_BROADCAST
            .get_or_init(|| {
                let (tx, _rx) = broadcast::channel(128);
                tx
            })
            .clone();

        let listener = match TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[remote] failed to bind websocket listener: {e}");
                return;
            }
        };

        eprintln!("[remote] listening on ws://{}", addr);

        loop {
            let Ok((stream, _)) = listener.accept().await else {
                continue;
            };

            let emitter = emitter.clone();
            let eval = eval.clone();
            let tx_broadcast = tx_broadcast.clone();
            tauri::async_runtime::spawn(async move {
                let ws_stream = match accept_async(stream).await {
                    Ok(ws) => ws,
                    Err(e) => {
                        eprintln!("[remote] websocket handshake failed: {e}");
                        return;
                    }
                };

                let (tx, rx) = ws_stream.split();
                let tx = Arc::new(Mutex::new(tx));

                // Fan out broadcast channel messages to this websocket connection.
                let tx_for_broadcast = tx.clone();
                let mut rx_broadcast = tx_broadcast.subscribe();
                tauri::async_runtime::spawn(async move {
                    while let Ok(msg) = rx_broadcast.recv().await {
                        let mut guard = tx_for_broadcast.lock().await;
                        if let Err(e) = guard.send(Message::Text(msg.clone())).await {
                            eprintln!("[remote] failed to forward broadcast: {e}");
                            break;
                        }
                    }
                });

                handle_socket(rx, tx, emitter, eval).await;
            });
        }
    })
}

/// Production entry point: bind to default port and emit to the main window.
pub fn start_remote_control(app: AppHandle) {
    let app_for_emit = app.clone();
    let emitter: RemoteEmitter = Arc::new(move |event, payload| {
        if let Some(win) = app_for_emit.get_webview_window("main") {
            if let Err(e) = win.emit(event, payload.clone()) {
                eprintln!("[remote] emit failed {event}: {e}");
            }
        }
    });

    let app_for_eval = app.clone();
    let eval: RemoteEval = Arc::new(move |script: &str| {
        if let Some(win) = app_for_eval.get_webview_window("main") {
            win.eval(script).map_err(|e| format!("eval failed: {e}"))
        } else {
            Err("main window not found".to_string())
        }
    });

    let addr: SocketAddr = "127.0.0.1:17814".parse().unwrap();
    start_remote_control_on(addr, emitter, eval);
}
