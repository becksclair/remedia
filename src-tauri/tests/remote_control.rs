#![cfg(feature = "remote-e2e")]

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use remedia_lib::remote_control::{RemoteEmitter, RemoteEval, start_remote_control_on};
use std::sync::Arc;

#[tokio::test]
async fn remote_control_round_trip() {
    // Capture emitted events
    let (tx, mut rx) = mpsc::unbounded_channel::<(String, serde_json::Value)>();
    let tx_events = tx.clone();
    let emitter: RemoteEmitter = Arc::new(move |event: &str, payload: serde_json::Value| {
        let _ = tx_events.send((event.to_string(), payload.clone()));
    });
    let eval: RemoteEval = Arc::new(move |script: &str| {
        let _ = tx.send(("runJs".to_string(), serde_json::Value::String(script.to_string())));
        Ok(())
    });

    // Use a test-specific port
    let addr: SocketAddr = "127.0.0.1:17815".parse().unwrap();
    let handle = start_remote_control_on(addr, emitter, eval);

    // Connect client
    let (mut ws, _) = connect_async("ws://127.0.0.1:17815").await.expect("ws connect");

    // addUrl
    ws.send(Message::Text(r#"{"action":"addUrl","url":"https://example.com/test"}"#.into())).await.unwrap();
    let resp1 = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("resp addUrl")
        .expect("msg ok")
        .unwrap()
        .into_text()
        .unwrap();
    assert!(resp1.contains("\"ok\":true"));

    // startDownloads
    ws.send(Message::Text(r#"{"action":"startDownloads"}"#.into())).await.unwrap();
    let _resp2 = timeout(Duration::from_secs(2), ws.next()).await.expect("resp start").expect("msg");

    // runJs
    ws.send(Message::Text(
        r#"{"action":"runJs","url":"document.body.dataset.fromRemote='1';"}"#.into(),
    ))
    .await
    .unwrap();
    let _resp_runjs = timeout(Duration::from_secs(2), ws.next()).await.expect("resp runJs").expect("msg");

    // cancelAll
    ws.send(Message::Text(r#"{"action":"cancelAll"}"#.into())).await.unwrap();
    let _resp3 = timeout(Duration::from_secs(2), ws.next()).await.expect("resp cancel").expect("msg");

    // status
    ws.send(Message::Text(r#"{"action":"status"}"#.into())).await.unwrap();
    let resp4 = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("resp status")
        .expect("msg ok")
        .unwrap()
        .into_text()
        .unwrap();
    assert!(resp4.contains("\"action\":\"status\""));

    // Validate events were emitted
    let mut seen = vec![];
    for _ in 0..4 {
        let (ev, payload) = timeout(Duration::from_secs(2), rx.recv()).await.expect("event").expect("payload");
        seen.push(ev.clone());
        if ev == "remote-add-url" {
            assert_eq!(payload, json!("https://example.com/test"));
        }
        if ev == "runJs" {
            assert_eq!(payload, json!("document.body.dataset.fromRemote='1';"));
        }
    }
    assert!(seen.contains(&"remote-add-url".to_string()));
    assert!(seen.contains(&"remote-start-downloads".to_string()));
    assert!(seen.contains(&"remote-cancel-downloads".to_string()));
    assert!(seen.contains(&"runJs".to_string()));

    handle.abort();
}
