//! Smoke tests for core web flows used by the frontend.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use bakarr::config::Config;
use bakarr::models::anime::{Anime, AnimeTitle};
use http_body_util::BodyExt;
use std::path::Path;
use std::sync::Arc;
use tower::ServiceExt;

async fn spawn_app_with_library_path(
    library_path: Option<String>,
) -> (Arc<bakarr::api::AppState>, Router, String) {
    let db_path =
        std::env::temp_dir().join(format!("bakarr-smoke-test-{}.db", uuid::Uuid::new_v4()));

    let mut config = Config::default();
    config.general.database_path = format!("sqlite:{}", db_path.display());
    config.qbittorrent.enabled = false;
    if let Some(path) = library_path {
        config.library.library_path = path;
    }

    let state = bakarr::api::create_app_state_from_config(config, None)
        .await
        .expect("failed to create app state");

    let api_key = state
        .store()
        .get_user_api_key("admin")
        .await
        .expect("failed to fetch api key")
        .expect("missing bootstrap api key");

    let router = bakarr::api::router(state.clone()).await;
    (state, router, api_key)
}

fn test_anime(id: i32, path: String) -> Anime {
    Anime {
        id,
        title: AnimeTitle {
            romaji: "Smoke Flow Anime".to_string(),
            english: None,
            native: None,
        },
        format: "TV".to_string(),
        episode_count: Some(12),
        status: "RELEASING".to_string(),
        quality_profile_id: Some(1),
        cover_image: None,
        banner_image: None,
        added_at: chrono::Utc::now().to_rfc3339(),
        profile_name: Some("Default".to_string()),
        path: Some(path),
        mal_id: None,
        description: None,
        score: None,
        genres: None,
        studios: None,
        start_year: Some(2025),
        monitored: true,
        metadata_provenance: None,
    }
}

#[tokio::test]
async fn smoke_login_anime_queue_and_settings() {
    let (_, app, api_key) = spawn_app_with_library_path(None).await;

    // Login endpoint smoke: invalid credentials should still return Unauthorized.
    let login_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/login")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "username": "admin",
                        "password": "invalid-password"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_response.status(), StatusCode::UNAUTHORIZED);

    // Anime list endpoint smoke.
    let anime_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/anime")
                .header("X-Api-Key", api_key.clone())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(anime_response.status(), StatusCode::OK);

    // Queue endpoint smoke.
    let queue_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/downloads/queue")
                .header("X-Api-Key", api_key.clone())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(queue_response.status(), StatusCode::OK);

    // Settings save smoke.
    let config_response = app
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
    assert_eq!(config_response.status(), StatusCode::OK);

    let config_body = config_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let mut current_config: serde_json::Value = serde_json::from_slice(&config_body).unwrap();
    current_config["data"]["scheduler"]["check_interval_minutes"] = serde_json::json!(15);

    let update_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/system/config")
                .header("X-Api-Key", api_key)
                .header("Content-Type", "application/json")
                .body(Body::from(current_config["data"].to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update_response.status(), StatusCode::OK);
}

#[tokio::test]
async fn smoke_add_anime_queue_then_import_completion_state() {
    let library_root =
        std::env::temp_dir().join(format!("bakarr-smoke-library-{}", uuid::Uuid::new_v4()));
    let incoming_root =
        std::env::temp_dir().join(format!("bakarr-smoke-incoming-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&library_root).await.unwrap();
    tokio::fs::create_dir_all(&incoming_root).await.unwrap();

    let (state, app, api_key) =
        spawn_app_with_library_path(Some(library_root.to_string_lossy().to_string())).await;

    let anime_id = 20001;
    let anime_path = library_root
        .join("Smoke Flow Anime")
        .to_string_lossy()
        .to_string();
    state
        .store()
        .add_anime(&test_anime(anime_id, anime_path))
        .await
        .expect("seed anime");

    let queued_filename = "[SubsPlease] Smoke Flow Anime - 01 (1080p).mkv";
    state
        .store()
        .record_download(
            anime_id,
            queued_filename,
            1.0,
            Some("SubsPlease"),
            Some("smokeflowhash01"),
        )
        .await
        .expect("record queued download");

    let queued = state
        .store()
        .get_download_by_hash("smokeflowhash01")
        .await
        .expect("fetch queued download")
        .expect("queued download should exist");
    assert!(!queued.imported);

    let source_file = incoming_root.join(queued_filename);
    tokio::fs::write(&source_file, b"fake-media-bytes")
        .await
        .expect("create source file");

    let import_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/library/import")
                .header("X-Api-Key", api_key.clone())
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "files": [{
                            "source_path": source_file.to_string_lossy(),
                            "anime_id": anime_id,
                            "episode_number": 1,
                            "season": 1
                        }]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(import_response.status(), StatusCode::OK);

    let import_body = import_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let import_json: serde_json::Value = serde_json::from_slice(&import_body).unwrap();
    assert_eq!(import_json["data"]["imported"], serde_json::json!(1));
    assert_eq!(import_json["data"]["failed"], serde_json::json!(0));

    let episodes_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/anime/{anime_id}/episodes"))
                .header("X-Api-Key", api_key)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(episodes_response.status(), StatusCode::OK);

    let episodes_body = episodes_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let episodes_json: serde_json::Value = serde_json::from_slice(&episodes_body).unwrap();
    let first_episode = episodes_json["data"]
        .as_array()
        .and_then(|episodes| episodes.iter().find(|episode| episode["number"] == 1))
        .expect("episode 1 should exist");

    assert_eq!(first_episode["downloaded"], serde_json::json!(true));
    let imported_path = first_episode["file_path"]
        .as_str()
        .expect("episode should have imported file path");
    assert!(Path::new(imported_path).exists());
}
