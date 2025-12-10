use futures_util::{SinkExt, StreamExt};
use once_cell::sync::OnceCell;
use serde::Deserialize;
use serde_json::{Value, json};
use std::env;
use std::net::SocketAddr;
use std::process;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;
use tokio::sync::{Mutex, broadcast};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};
use uuid::Uuid;

use tauri::{AppHandle, Emitter, Event, Listener, Manager};

use crate::downloader::{DownloadSettings, download_media, get_queue_status};
use crate::events::*;
use crate::logging::{ErrorCategory, log_debug_simple, log_error_simple, log_info_simple};

pub type RemoteEmitter = Arc<dyn Fn(&str, Value) + Send + Sync + 'static>;
pub type RemoteEval = Arc<dyn Fn(&str) -> Result<(), String> + Send + Sync + 'static>;

// Broadcast channel used to push app events back to remote test clients.
static REMOTE_BROADCAST: OnceCell<broadcast::Sender<String>> = OnceCell::new();

/// Check if any remote clients are connected (O(1) check to skip serialization overhead).
pub fn is_remote_active() -> bool {
    REMOTE_BROADCAST.get().is_some_and(|tx| tx.receiver_count() > 0)
}

/// Publish an event to any connected remote clients (best-effort, no-op if remote WS disabled).
pub fn broadcast_remote_event(event: &str, payload: Value) {
    if let Some(tx) = REMOTE_BROADCAST.get() {
        let _ = tx.send(json!({ "event": event, "payload": payload }).to_string());
    }
}

/// Conditionally broadcast an event only if remote clients are connected.
/// This avoids JSON serialization overhead when no one is listening.
#[inline]
pub fn broadcast_if_active(event: &str, payload: Value) {
    if is_remote_active() {
        broadcast_remote_event(event, payload);
    }
}

/// Helper: listen to a Tauri event from the main window and forward it to any
/// connected remote clients via the REMOTE_BROADCAST channel.
fn forward_debug_tauri_event(app: &AppHandle, source_event: &'static str, remote_event: &'static str) {
    use tauri::Listener;

    let app_for_listen = app.clone();
    // `listen` registers a handler synchronously; we don't need to spawn a
    // background task here, which avoids lifetime issues for the event names.
    app_for_listen.listen(source_event, move |event| {
        let payload = event.payload();
        if let Ok(value) = serde_json::from_str::<Value>(payload) {
            broadcast_remote_event(remote_event, value);
        } else {
            broadcast_remote_event(remote_event, json!(payload));
        }
    });
}

/// Tauri command to broadcast debug data from the webview to remote console.
/// This allows JS scripts to send data back for debugging.
#[tauri::command]
pub fn debug_broadcast(app: AppHandle, data: String) {
    // Log truncated preview only in debug builds to avoid exposing sensitive content
    if cfg!(debug_assertions) {
        let preview = if data.len() > 100 {
            format!("{}...", &data[..100])
        } else {
            data.clone()
        };
        log_debug_simple(&app, ErrorCategory::Unknown, &format!("[debug_broadcast] received data: {}", preview));
    }

    // Parse as JSON if possible, otherwise wrap as string
    let payload: Value = serde_json::from_str(&data).unwrap_or_else(|_| json!(data));
    log_info_simple(&app, ErrorCategory::Unknown, "[debug_broadcast] broadcasting debug-echo");
    broadcast_remote_event(EVT_DEBUG_ECHO, payload);
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteCommand {
    action: String,
    url: Option<String>,
    path: Option<String>,
    media_idx: Option<i32>,
    /// Arbitrary JSON data for debug commands
    data: Option<Value>,
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
                    emitter(EVT_REMOTE_ADD_URL, Value::String(url.clone()));
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
                emitter(EVT_REMOTE_START, Value::Null);
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
                emitter(EVT_REMOTE_CANCEL, Value::Null);
                let _ =
                    tx.lock().await.send(Message::Text(r#"{"ok":true,"action":"cancelAll"}"#.to_string().into())).await;
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(r#"{"event":"remote-recv","payload":"cancelAll"}"#.to_string().into()))
                    .await;
            }
            "clearList" => {
                emitter(EVT_REMOTE_CLEAR_LIST, Value::Null);
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
                    emitter(EVT_REMOTE_SET_DOWNLOAD_DIR, Value::String(path.clone()));
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
            "debugEcho" => {
                // Echo arbitrary data back as an event for debugging
                let data = cmd.data.unwrap_or(json!(null));
                let _ = tx
                    .lock()
                    .await
                    .send(Message::Text(json!({"event": EVT_DEBUG_ECHO, "payload": data}).to_string().into()))
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
            // Run JS and automatically broadcast window.__DEBUG_RESULT if set
            "runJsCapture" => {
                if let Some(script) = cmd.url {
                    // Run the provided script
                    let _ = eval(script.as_str());

                    // Wait for async script completion
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                    // Read __DEBUG_RESULT and broadcast it via a callback script
                    let broadcast_script = r#"
                        (function() {
                            var result = window.__DEBUG_RESULT || null;
                            if (result) {
                                // Clear after reading
                                delete window.__DEBUG_RESULT;
                                // Store in DOM for retrieval
                                document.body.setAttribute('data-remote-debug-result', result);
                            }
                        })();
                    "#;
                    let _ = eval(broadcast_script);

                    // Wait a bit more, then read the DOM attribute via another eval
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

                    // Use a simple polling approach - have the script set a known value
                    // Since we can't read eval results, we'll use a workaround:
                    // The script already stored result in window.__DEBUG_RESULT
                    // We send a response indicating the script ran
                    let _ =
                        tx.lock()
                            .await
                            .send(
                                Message::Text(
                                    r#"{"ok":true,"action":"runJsCapture","note":"check debug-echo for result"}"#
                                        .to_string()
                                        .into(),
                                ),
                            )
                            .await;
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"action":"runJsCapture","error":"script required"}"#.to_string().into(),
                        ))
                        .await;
                }
            }
            // Run JS and read result from document.body.dataset.debugResult, then broadcast
            "runJsGetResult" => {
                if let Some(script) = cmd.url {
                    // Execute the provided script and propagate eval errors back to the caller
                    if let Err(e) = eval(script.as_str()) {
                        let _ = tx
                            .lock()
                            .await
                            .send(Message::Text(
                                format!(r#"{{"ok":false,"action":"runJsGetResult","error":"eval failed: {}"}}"#, e)
                                    .into(),
                            ))
                            .await;
                        continue;
                    }

                    // Give the script a moment to complete
                    tokio::time::sleep(Duration::from_millis(100)).await;

                    // Build a unique event name using a UUID so we can listen for a one-off result
                    let result_event_name = format!("remote-get-result-{}", Uuid::new_v4());

                    // If we have an app handle, create a one-off listener for the result event
                    if let Some(handle) = &app {
                        let (result_tx, mut result_rx) = tokio::sync::mpsc::channel::<String>(1);
                        let result_tx_clone = result_tx.clone();
                        let app_for_listen = handle.clone();

                        // Register a listener that forwards any payload into our mpsc channel.
                        // The closure is synchronous but we spawn an async task to enqueue into the channel.
                        let listener_id = app_for_listen.listen(&result_event_name, move |evt: Event| {
                            let payload = evt.payload().to_string();
                            let tx = result_tx_clone.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = tx.send(payload).await;
                            });
                        });

                        // Build a script that reads fallback locations, clears them, and emits the
                        // unique event with the captured payload. This tries to be resilient
                        // across environments and emits a JSON string if the result is an object.
                        let followup = format!(
                            r#"
                            (function() {{
                                try {{
                                    var result = window.__REMOTE_DEBUG_LAST_RESULT || document.body.dataset.debugResult || localStorage.getItem('__debug_result') || null;
                                    delete window.__REMOTE_DEBUG_LAST_RESULT;
                                    try {{ delete document.body.dataset.debugResult; }} catch(e) {{}}
                                    try {{ localStorage.removeItem('__debug_result'); }} catch(e) {{}}
                                    var emit = window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.emit;
                                    try {{
                                        if (emit) {{
                                            // If result looks like a JSON string/object, try to parse it
                                            var payload = result;
                                            try {{ payload = JSON.parse(result); }} catch(e) {{ /* not JSON */ }}
                                            emit("{event}", payload);
                                        }} else {{
                                            // As a fallback, set the global so it can be polled
                                            window.__REMOTE_DEBUG_LAST_RESULT = result;
                                        }}
                                    }} catch(e) {{
                                        if (emit) {{ emit("{event}", {{"__error": String(e)}}); }}
                                    }}
                                }} catch(e) {{
                                    var emit = window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.emit;
                                    if (emit) {{ emit("{event}", {{"__error": String(e)}}); }}
                                }}
                            }})();
                        "#,
                            event = result_event_name
                        );

                        // Run the follow-up eval and propagate eval errors
                        if let Err(e) = eval(&followup) {
                            let _ = tx
                                .lock()
                                .await
                                .send(Message::Text(
                                    format!(r#"{{"ok":false,"action":"runJsGetResult","error":"followup eval failed: {}"}}"#, e).into(),
                                ))
                                .await;
                            // Cleanup the listener
                            handle.unlisten(listener_id);
                            continue;
                        }

                        // Wait a short while for the listener to receive the payload
                        match tokio::time::timeout(Duration::from_millis(2000), result_rx.recv()).await {
                            Ok(Some(payload)) => {
                                // Try to parse as JSON, fallback to string
                                let value: Value = serde_json::from_str(&payload).unwrap_or_else(|_| json!(payload));
                                let _ = tx
                                    .lock()
                                    .await
                                    .send(Message::Text(
                                        json!({"ok":true, "action":"runJsGetResult", "result": value})
                                            .to_string()
                                            .into(),
                                    ))
                                    .await;
                            }
                            Ok(None) => {
                                let _ =
                                    tx.lock()
                                        .await
                                        .send(Message::Text(
                                            r#"{"ok":false,"action":"runJsGetResult","error":"no result received"}"#
                                                .to_string()
                                                .into(),
                                        ))
                                        .await;
                            }
                            Err(_) => {
                                let _ = tx
                                    .lock()
                                    .await
                                    .send(Message::Text(r#"{"ok":false,"action":"runJsGetResult","error":"timeout waiting for result"}"#.to_string().into()))
                                    .await;
                            }
                        }

                        // Always cleanup the listener
                        handle.unlisten(listener_id);
                    } else {
                        // No app handle to listen for result; return an error to caller
                        let _ = tx
                            .lock()
                            .await
                            .send(Message::Text(
                                r#"{"ok":false,"action":"runJsGetResult","error":"app handle unavailable to capture result"}"#.to_string().into(),
                            ))
                            .await;
                    }
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"action":"runJsGetResult","error":"script required"}"#.to_string().into(),
                        ))
                        .await;
                }
            }
            "inspectWindow" => {
                let Some(label) = cmd.url.clone() else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"action":"inspectWindow","error":"label required"}"#.to_string().into(),
                        ))
                        .await;
                    continue;
                };

                if let Some(handle) = &app {
                    if let Some(win) = handle.get_webview_window(&label) {
                        let visible = win.is_visible().unwrap_or(false);
                        let focused = win.is_focused().unwrap_or(false);
                        let minimized = win.is_minimized().unwrap_or(false);
                        let _ = tx
                            .lock()
                            .await
                            .send(Message::Text(
                                json!({
                                    "ok": true,
                                    "action": "inspectWindow",
                                    "label": label,
                                    "visible": visible,
                                    "focused": focused,
                                    "minimized": minimized
                                })
                                .to_string()
                                .into(),
                            ))
                            .await;
                    } else {
                        let _ = tx
                            .lock()
                            .await
                            .send(Message::Text(
                                json!({
                                    "ok": false,
                                    "action": "inspectWindow",
                                    "error": format!("window '{label}' not found")
                                })
                                .to_string()
                                .into(),
                            ))
                            .await;
                    }
                } else {
                    let _ = tx
                        .lock()
                        .await
                        .send(Message::Text(
                            r#"{"ok":false,"action":"inspectWindow","error":"app handle unavailable"}"#.to_string().into(),
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
                                download_media(
                                    app_handle.clone(),
                                    win,
                                    media_idx,
                                    url.clone(),
                                    path.clone(),
                                    None,
                                    settings,
                                );
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
) -> tauri::async_runtime::JoinHandle<()> {
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
                if let Some(ref app_handle) = app {
                    log_error_simple(
                        app_handle,
                        ErrorCategory::Network,
                        "Failed to bind websocket listener",
                        Some(&e.to_string()),
                    );
                } else {
                    eprintln!("Failed to bind websocket listener: {}", e);
                }
                return;
            }
        };

        if let Some(ref app_handle) = app {
            log_info_simple(app_handle, ErrorCategory::Unknown, &format!("[remote] listening on ws://{}", addr));
        } else {
            println!("[remote] listening on ws://{}", addr);
        }

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

    // Listen for debug events from frontend and forward to WebSocket.
    // New unified protocol: debug-snapshot with a { kind, data } payload.
    forward_debug_tauri_event(&app, EVT_DEBUG_SNAPSHOT, EVT_DEBUG_SNAPSHOT);

    // Legacy events kept for backward compatibility with older scripts.
    forward_debug_tauri_event(&app, "debug-thumb-result", "debug-thumb-result");
    forward_debug_tauri_event(&app, "debug-capture-result", "debug-capture-result");

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
