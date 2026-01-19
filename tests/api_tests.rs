use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use bakarr::config::Config;
use http_body_util::BodyExt;
use tower::ServiceExt;

async fn spawn_app() -> Router {
    let mut config = Config::default();
    config.general.database_path = "sqlite::memory:".to_string();
    config.auth.username = "admin".to_string();
    config.auth.password = "password".to_string();
    config.auth.api_key = "test-api-key".to_string();

    let state = bakarr::api::create_app_state(config, None)
        .await
        .expect("Failed to create app state");
    bakarr::api::router(state)
}

#[tokio::test]
async fn test_auth_endpoints() {
    let app = spawn_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/status")
                .header("X-Api-Key", "wrong-key")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/status")
                .header("X-Api-Key", "test-api-key")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_system_config() {
    let app = spawn_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/config")
                .header("X-Api-Key", "test-api-key")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(body_json["data"]["library"]["library_path"].is_string());

    let mut current_config = body_json["data"].clone();
    current_config["scheduler"]["check_interval_minutes"] = serde_json::json!(999);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/system/config")
                .header("X-Api-Key", "test-api-key")
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_string(&current_config).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/config")
                .header("X-Api-Key", "test-api-key")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(
        body_json["data"]["scheduler"]["check_interval_minutes"],
        999
    );
}

#[tokio::test]
async fn test_profiles_crud() {
    let app = spawn_app().await;
    let auth_header = "X-Api-Key";
    let auth_key = "test-api-key";

    let new_profile = serde_json::json!({
        "name": "IntegrationTestProfile",
        "cutoff": "WEB 1080p",
        "upgrade_allowed": true,
        "seadex_preferred": false,
        "allowed_qualities": ["WEB 1080p", "WEB 720p"]
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/profiles")
                .header(auth_header, auth_key)
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_string(&new_profile).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/profiles/IntegrationTestProfile")
                .header(auth_header, auth_key)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/profiles/IntegrationTestProfile")
                .header(auth_header, auth_key)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/profiles/IntegrationTestProfile")
                .header(auth_header, auth_key)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
