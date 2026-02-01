//! Integration tests for System API endpoints.
//!
//! Tests system status, logs retrieval, and log export functionality.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use bakarr::config::Config;
use http_body_util::BodyExt;
use tower::ServiceExt;

/// Default API key seeded by migration (must match `m20260127_add_users.rs`)
const DEFAULT_API_KEY: &str = "bakarr_default_api_key_please_regenerate";

async fn spawn_app() -> Router {
    let mut config = Config::default();
    config.general.database_path = "sqlite::memory:".to_string();

    let state = bakarr::api::create_app_state_from_config(config, None)
        .await
        .expect("Failed to create app state");
    bakarr::api::router(state).await
}

#[tokio::test]
async fn test_get_status() {
    let app = spawn_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/status")
                .header("X-Api-Key", DEFAULT_API_KEY)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(body_json["success"].as_bool().unwrap());
    assert!(body_json["data"].is_object());

    let data = body_json["data"].as_object().unwrap();
    assert!(data.get("version").is_some());
    assert!(data.get("uptime").is_some());
    assert!(data.get("monitored_anime").is_some());
    assert!(data.get("total_episodes").is_some());
    assert!(data.get("missing_episodes").is_some());
    assert!(data.get("active_torrents").is_some());
    assert!(data.get("pending_downloads").is_some());
    assert!(data.get("disk_space").is_some());
}

#[tokio::test]
async fn test_get_logs() {
    let app = spawn_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/logs")
                .header("X-Api-Key", DEFAULT_API_KEY)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(body_json["success"].as_bool().unwrap());
    assert!(body_json["data"].is_object());

    let data = body_json["data"].as_object().unwrap();
    assert!(data.get("logs").is_some());
    assert!(data.get("total_pages").is_some());
    assert!(data["logs"].is_array());

    // Test pagination
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/logs?page=1&page_size=10")
                .header("X-Api-Key", DEFAULT_API_KEY)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_export_logs_json() {
    let app = spawn_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/logs/export?format=json")
                .header("X-Api-Key", DEFAULT_API_KEY)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(content_type.contains("application/json"));

    let content_disposition = response
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(content_disposition.contains("system_logs.json"));

    let body = response.into_body().collect().await.unwrap().to_bytes();
    // Verify it's valid JSON (should be an array of log objects)
    let logs: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(logs.is_array());
}

#[tokio::test]
async fn test_export_logs_csv() {
    let app = spawn_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/logs/export?format=csv")
                .header("X-Api-Key", DEFAULT_API_KEY)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(content_type.contains("text/csv"));

    let content_disposition = response
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(content_disposition.contains("system_logs.csv"));

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let csv_content = String::from_utf8(body.to_vec()).unwrap();

    // Verify CSV has expected header
    assert!(csv_content.starts_with("id,created_at,level,event_type,message,details"));
}
