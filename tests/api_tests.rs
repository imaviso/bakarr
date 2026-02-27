use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use bakarr::config::Config;
use http_body_util::BodyExt;
use tower::ServiceExt;

async fn spawn_app() -> (Router, String) {
    let db_path = std::env::temp_dir().join(format!("bakarr-api-test-{}.db", uuid::Uuid::new_v4()));

    let mut config = Config::default();
    config.general.database_path = format!("sqlite:{}", db_path.display());
    config.server.allow_api_key_in_query = true;

    let state = bakarr::api::create_app_state_from_config(config, None)
        .await
        .expect("Failed to create app state");

    let api_key = state
        .store()
        .get_user_api_key("admin")
        .await
        .expect("Failed to fetch bootstrap API key")
        .expect("Bootstrap admin user missing API key");

    (bakarr::api::router(state).await, api_key)
}

#[tokio::test]
async fn test_auth_endpoints() {
    let (app, api_key) = spawn_app().await;

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
                .header("X-Api-Key", api_key.clone())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Query auth is scoped to SSE/stream routes, not generic endpoints.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/system/status?api_key={api_key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // SSE endpoint still supports query auth fallback.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/events?api_key={api_key}"))
                .header("Accept", "text/event-stream")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_login_rate_limit_lockout() {
    let (app, _) = spawn_app().await;

    for _ in 0..5 {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "username": "admin",
                            "password": "definitely-wrong-password"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    let locked_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/login")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "username": "admin",
                        "password": "definitely-wrong-password"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(locked_response.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn test_system_config() {
    let (app, api_key) = spawn_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/system/config")
                .header("X-Api-Key", api_key.clone())
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
    current_config["scheduler"]["check_interval_minutes"] = serde_json::json!(15);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/system/config")
                .header("X-Api-Key", api_key.clone())
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
                .header("X-Api-Key", api_key)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(body_json["data"]["scheduler"]["check_interval_minutes"], 15);
}

#[tokio::test]
async fn test_profiles_crud() {
    let (app, api_key) = spawn_app().await;

    let new_profile = serde_json::json!({
        "name": "IntegrationTestProfile",
        "cutoff": "WEB-DL 1080p",
        "upgrade_allowed": true,
        "seadex_preferred": false,
        "allowed_qualities": ["WEB-DL 1080p", "WEB-DL 720p"]
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/profiles")
                .header("X-Api-Key", api_key.clone())
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
                .header("X-Api-Key", api_key.clone())
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
                .header("X-Api-Key", api_key.clone())
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
                .header("X-Api-Key", api_key)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
