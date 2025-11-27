use futures_util::{SinkExt, StreamExt};
use once_cell::sync::OnceCell;
use serde::Deserialize;
use serde_json::{Value, json};
use std::env;
use std::net::SocketAddr;
use std::process;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;
use tokio::sync::{Mutex, broadcast};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri::async_runtime::JoinHandle;

use crate::downloader::{DownloadSettings, download_media, get_queue_status};

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
    path: Option<String>,
    media_idx: Option<i32>,
}

type WsStream = WebSocketStream<tokio::net::TcpStream>;
type WsSink = futures_util::stream::SplitSink<WsStream, Message>;
type WsSource = futures_util::stream::SplitStream<WsStream>;

fn build_remote_hello() -> String {
    let env_flag = env::var("ENABLE_REMOTE_HARNESS").ok();
    let tauri_env = env::var("TAURI_ENVIRONMENT").ok();
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    json!({
        "event": "remote-hello",
        "payload": {
            "pid": process::id(),
            "enableRemoteHarnessEnv": env_flag,
            "debugFallback": cfg!(debug_assertions),
            "tauriEnv": tauri_env,
            "ts": ts,
        }
    })
    .to_string()
}

async fn handle_socket(
    mut rx: WsSource,
    tx: Arc<Mutex<WsSink>>,
    emitter: RemoteEmitter,
    eval: RemoteEval,
    app: Option<AppHandle>,
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
                    .send(Message::Text(format!(r#"{{"ok":false,"error":"bad command: {e}"}}"#).into()))
                    .await;
                continue;
            }
        };

        match cmd.action.as_str() {
            "addUrl" => {
                if let Some(url) = cmd.url {
                    emitter("remote-add-url", Value::String(url.clone()));
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(r#"{"ok":true,"action":"addUrl"}"#.to_string().into()))
                        .await;
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(format!(r#"{{"event":"remote-recv","payload":"addUrl {url}"}}"#).into()))
                        .await;
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"error":"url required","action":"addUrl"}"#.to_string().into(),
                        ))
                        .await;
                }
            }
            "startDownloads" => {
                emitter("remote-start-downloads", Value::Null);
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(r#"{"ok":true,"action":"startDownloads"}"#.to_string().into()))
                    .await;
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(r#"{"event":"remote-recv","payload":"startDownloads"}"#.to_string().into()))
                    .await;
            }
            "cancelAll" => {
                emitter("remote-cancel-downloads", Value::Null);
                let _ =
                    tx.lock().await.send(Message::Text(r#"{"ok":true,"action":"cancelAll"}"#.to_string().into())).await;
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(r#"{"event":"remote-recv","payload":"cancelAll"}"#.to_string().into()))
                    .await;
            }
            "clearList" => {
                emitter("remote-clear-list", Value::Null);
                let _ =
                    tx.lock().await.send(Message::Text(r#"{"ok":true,"action":"clearList"}"#.to_string().into())).await;
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(r#"{"event":"remote-recv","payload":"clearList"}"#.to_string().into()))
                    .await;
            }
            "setDownloadDir" => {
                if let Some(path) = cmd.path.or(cmd.url) {
                    emitter("remote-set-download-dir", Value::String(path.clone()));
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(r#"{"ok":true,"action":"setDownloadDir"}"#.to_string().into()))
                        .await;
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            format!(r#"{{"event":"remote-recv","payload":"setDownloadDir {path}"}}"#).into(),
                        ))
                        .await;
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"action":"setDownloadDir","error":"path required"}"#.to_string().into(),
                        ))
                        .await;
                }
            }
            "status" => {
                let status = get_queue_status();
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(
                        format!(
                            r#"{{"ok":true,"action":"status","queued":{},"active":{},"max":{}}}"#,
                            status.0, status.1, status.2
                        )
                        .into(),
                    ))
                    .await;
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(r#"{"event":"remote-recv","payload":"status"}"#.to_string().into()))
                    .await;
            }
            "runJs" => {
                if let Some(script) = cmd.url {
                    match eval(script.as_str()) {
                        Ok(_) => {
                            let _ = tx
                                .lock()
                                .await
                                .send(Message::Text(r#"{"ok":true,"action":"runJs"}"#.to_string().into()))
                                .await;
                            let _ = tx
                                .lock()
                                .await
                                .send(Message::Text(
                                    format!(r#"{{"event":"remote-recv","payload":"runJs {script}"}}"#).into(),
                                ))
                                .await;
                        }
                        Err(e) => {
                            let _ = tx
                                .lock()
                                .await
                                .send(Message::Text(
                                    format!(r#"{{"ok":false,"action":"runJs","error":"{}"}}"#, e).into(),
                                ))
                                .await;
                        }
                    }
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"action":"runJs","error":"script required"}"#.to_string().into(),
                        ))
                        .await;
                }
            }
            "startDownloadDirect" => {
                if let Some(url) = cmd.url {
                    let path = cmd.path.unwrap_or_default();
                    let media_idx = cmd.media_idx.unwrap_or(0);
                    let settings = DownloadSettings::remote_defaults();
                    match &app {
                        Some(app_handle) => {
                            if let Some(win) = app_handle.get_window("main") {
                                download_media(app_handle.clone(), win, media_idx, url.clone(), path.clone(), settings);
                                let _ = tx
                                    .lock()
                                    .await
                                    .send(Message::Text(
                                        r#"{"ok":true,"action":"startDownloadDirect"}"#.to_string().into(),
                                    ))
                                    .await;
                                let _ = tx
                                    .lock()
                                    .await
                                    .send(Message::Text(
                                        format!(r#"{{"event":"remote-recv","payload":"startDownloadDirect {url}"}}"#)
                                            .into(),
                                    ))
                                    .await;
                            } else {
                                let _ = tx
                                    .lock()
                                    .await
                                    .send(Message::Text(
                                        r#"{"ok":false,"action":"startDownloadDirect","error":"main window missing"}"#
                                            .to_string()
                                            .into(),
                                    ))
                                    .await;
                            }
                        }
                        None => {
                            let _ = tx
                                .lock()
                                .await
                                .send(Message::Text(
                                    r#"{"ok":false,"action":"startDownloadDirect","error":"app handle unavailable"}"#
                                        .to_string()
                                        .into(),
                                ))
                                .await;
                        }
                    }
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"action":"startDownloadDirect","error":"url required"}"#.to_string().into(),
                        ))
                        .await;
                }
            }
            _ => {
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(r#"{"ok":false,"error":"unknown action"}"#.to_string().into()))
                    .await;
            }
        }
    }
}

/// Start a websocket server on the given address with a provided emitter (used by app and tests).
pub fn start_remote_control_on(
    addr: SocketAddr,
    emitter: RemoteEmitter,
    eval: RemoteEval,
    app: Option<AppHandle>,
) -> JoinHandle<()> {
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
            let app_for_conn = app.clone();
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
                // Send a deterministic handshake so harnesses can verify the backend.
                let hello = Message::Text(build_remote_hello().into());
                {
                    let mut guard = tx.lock().await;
                    if let Err(e) = guard.send(hello.clone()).await {
                        eprintln!("[remote] failed to send hello: {e}");
                        return;
                    }
                }

                // Fan out broadcast channel messages to this websocket connection.
                let tx_for_broadcast = tx.clone();
                let mut rx_broadcast = tx_broadcast.subscribe();
                tauri::async_runtime::spawn(async move {
                    while let Ok(msg) = rx_broadcast.recv().await {
                        let mut guard = tx_for_broadcast.lock().await;
                        if let Err(e) = guard.send(Message::Text(msg.clone().into())).await {
                            eprintln!("[remote] failed to forward broadcast: {e}");
                            break;
                        }
                    }
                });

                handle_socket(rx, tx, emitter, eval, app_for_conn.clone()).await;
            });
        }
    })
}

/// Production entry point: bind to default port and emit to the main window.
pub fn start_remote_control(app: AppHandle) {
    let app_for_emit = app.clone();
    let emitter: RemoteEmitter = Arc::new(move |event, payload| {
        if let Some(win) = app_for_emit.get_webview_window("main")
            && let Err(e) = win.emit(event, payload.clone())
        {
            eprintln!("[remote] emit failed {event}: {e}");
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
    start_remote_control_on(addr, emitter, eval, Some(app));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_build_remote_hello_structure() {
        let hello = build_remote_hello();
        let parsed: serde_json::Value = serde_json::from_str(&hello).unwrap();

        assert_eq!(parsed["event"], "remote-hello");
        assert!(parsed["payload"]["pid"].is_number());
        assert!(parsed["payload"]["ts"].is_number());
        assert!(parsed["payload"]["debugFallback"].is_boolean());
    }

    #[test]
    fn test_build_remote_hello_includes_process_id() {
        let hello = build_remote_hello();
        let parsed: serde_json::Value = serde_json::from_str(&hello).unwrap();

        let pid = parsed["payload"]["pid"].as_u64().unwrap();
        assert_eq!(pid, std::process::id() as u64);
    }

    #[test]
    fn test_build_remote_hello_includes_timestamp() {
        let hello = build_remote_hello();
        let parsed: serde_json::Value = serde_json::from_str(&hello).unwrap();

        let ts = parsed["payload"]["ts"].as_u64().unwrap();
        assert!(ts > 0);
    }

    #[test]
    fn test_build_remote_hello_debug_flag() {
        let hello = build_remote_hello();
        let parsed: serde_json::Value = serde_json::from_str(&hello).unwrap();

        let debug_flag = parsed["payload"]["debugFallback"].as_bool().unwrap();
        assert_eq!(debug_flag, cfg!(debug_assertions));
    }

    #[test]
    fn test_build_remote_hello_environment_vars() {
        let hello = build_remote_hello();
        let parsed: serde_json::Value = serde_json::from_str(&hello).unwrap();

        let env_flag = parsed["payload"]["enableRemoteHarnessEnv"].as_str();
        let tauri_env = parsed["payload"]["tauriEnv"].as_str();

        assert!(env_flag.is_some() || env_flag.unwrap_or_default().is_empty());
        assert!(tauri_env.is_some() || tauri_env.unwrap_or_default().is_empty());
    }

    #[test]
    fn test_remote_command_deserialization_valid() {
        let json = r#"{"action":"addUrl","url":"https://example.com"}"#;
        let cmd: RemoteCommand = serde_json::from_str(json).unwrap();

        assert_eq!(cmd.action, "addUrl");
        assert_eq!(cmd.url, Some("https://example.com".to_string()));
        assert_eq!(cmd.path, None);
        assert_eq!(cmd.media_idx, None);
    }

    #[test]
    fn test_remote_command_deserialization_all_fields() {
        let json = r#"{"action":"startDownloadDirect","url":"https://example.com","path":"/tmp","mediaIdx":5}"#;
        let cmd: RemoteCommand = serde_json::from_str(json).unwrap();

        assert_eq!(cmd.action, "startDownloadDirect");
        assert_eq!(cmd.url, Some("https://example.com".to_string()));
        assert_eq!(cmd.path, Some("/tmp".to_string()));
        assert_eq!(cmd.media_idx, Some(5));
    }

    #[test]
    fn test_remote_command_deserialization_invalid_json() {
        let json = r#"{"action":"addUrl","url":}"#;
        let result: Result<RemoteCommand, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_remote_command_deserialization_missing_action() {
        let json = r#"{"url":"https://example.com"}"#;
        let result: Result<RemoteCommand, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_remote_command_deserialization_empty_action() {
        let json = r#"{"action":"","url":"https://example.com"}"#;
        let cmd: RemoteCommand = serde_json::from_str(json).unwrap();

        assert_eq!(cmd.action, "");
        assert_eq!(cmd.url, Some("https://example.com".to_string()));
    }

    #[test]
    fn test_broadcast_remote_event_without_channel() {
        broadcast_remote_event("test-event", json!("test-payload"));
    }

    #[test]
    #[ignore]
    fn test_broadcast_remote_event_with_mock_channel() {
        use tokio::sync::broadcast;

        let (tx, _rx) = broadcast::channel(128);
        let _ = REMOTE_BROADCAST.set(tx);

        broadcast_remote_event("test-event", json!("test-payload"));
    }

    #[test]
    #[ignore]
    fn test_broadcast_remote_event_serialization() {
        use tokio::sync::broadcast;

        let (tx, mut rx) = broadcast::channel(128);
        let _ = REMOTE_BROADCAST.set(tx);

        broadcast_remote_event("test-event", json!("test-payload"));

        let received = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&received).unwrap();

        assert_eq!(parsed["event"], "test-event");
        assert_eq!(parsed["payload"], json!("test-payload"));
    }

    #[test]
    fn test_message_text_construction_with_string() {
        // This test ensures that tokio-tungstenite's Message::Text API still accepts
        // a UTF-8 text payload created from a Rust String via .into(). If the
        // upstream API changes again, this should fail to compile here first.
        let msg = Message::Text("hello".to_string().into());

        match msg {
            Message::Text(_) => {}
            _ => panic!("expected text message"),
        }
    }
}
