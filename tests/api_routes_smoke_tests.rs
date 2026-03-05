use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode},
};
use bakarr::config::Config;
use bakarr::models::anime::{Anime, AnimeTitle};
use http_body_util::BodyExt;
use std::sync::Arc;
use tower::ServiceExt;

async fn spawn_app() -> (Arc<bakarr::api::AppState>, Router, String, String) {
    let db_path = std::env::temp_dir().join(format!(
        "bakarr-api-routes-test-{}.db",
        uuid::Uuid::new_v4()
    ));
    let library_root = std::env::temp_dir().join(format!(
        "bakarr-api-routes-library-{}",
        uuid::Uuid::new_v4()
    ));
    tokio::fs::create_dir_all(&library_root)
        .await
        .expect("create library root");

    let mut config = Config::default();
    config.general.database_path = format!("sqlite:{}", db_path.display());
    config.qbittorrent.enabled = false;
    config.library.library_path = library_root.to_string_lossy().to_string();

    let state = bakarr::api::create_app_state_from_config(config, None)
        .await
        .expect("failed to create app state");

    let api_key = state
        .store()
        .get_user_api_key("admin")
        .await
        .expect("fetch api key")
        .expect("bootstrap api key");

    let router = bakarr::api::router(state.clone()).await;
    (
        state,
        router,
        api_key,
        library_root.to_string_lossy().to_string(),
    )
}

fn test_anime(id: i32, path: String) -> Anime {
    Anime {
        id,
        title: AnimeTitle {
            romaji: format!("API Smoke Anime {id}"),
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
        start_year: Some(2026),
        monitored: true,
        metadata_provenance: None,
    }
}

async fn request(
    app: &Router,
    method: Method,
    uri: String,
    api_key: &str,
    body: Body,
    content_type: Option<&str>,
) -> axum::http::Response<Body> {
    let mut builder = Request::builder().method(method).uri(uri);
    builder = builder.header("X-Api-Key", api_key);
    if let Some(ct) = content_type {
        builder = builder.header("Content-Type", ct);
    }

    app.clone()
        .oneshot(builder.body(body).expect("build request"))
        .await
        .expect("request should succeed")
}

#[tokio::test]
async fn api_common_routes_do_not_return_server_errors() {
    let (_, app, api_key, _) = spawn_app().await;

    let get_paths = vec![
        "/api/anime",
        "/api/downloads/history",
        "/api/downloads/queue",
        "/api/wanted/missing",
        "/api/calendar",
        "/api/profiles",
        "/api/profiles/qualities",
        "/api/release-profiles",
        "/api/rss",
        "/api/library/stats",
        "/api/library/activity",
        "/api/library/unmapped",
        "/api/system/status",
        "/api/system/config",
        "/api/system/logs",
        "/api/system/logs/export?format=json",
        "/api/metrics",
    ];

    for path in get_paths {
        let response = request(
            &app,
            Method::GET,
            path.to_string(),
            &api_key,
            Body::empty(),
            None,
        )
        .await;

        assert!(
            !response.status().is_server_error(),
            "{} returned {}",
            path,
            response.status()
        );
    }

    let events_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/events")
                .header("X-Api-Key", api_key.clone())
                .header("Accept", "text/event-stream")
                .body(Body::empty())
                .expect("build events request"),
        )
        .await
        .expect("events request");
    assert_eq!(events_response.status(), StatusCode::OK);

    for path in ["/api/system/tasks/scan", "/api/system/tasks/rss"] {
        let response = request(
            &app,
            Method::POST,
            path.to_string(),
            &api_key,
            Body::empty(),
            None,
        )
        .await;

        assert!(
            !response.status().is_server_error(),
            "{} returned {}",
            path,
            response.status()
        );
    }
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn api_anime_scoped_and_crud_routes_smoke() {
    let (state, app, api_key, library_root) = spawn_app().await;
    let anime_id = 42001;
    let anime_folder = format!("{library_root}/API Smoke Anime");
    tokio::fs::create_dir_all(&anime_folder)
        .await
        .expect("create anime folder");
    state
        .store()
        .add_anime(&test_anime(anime_id, anime_folder.clone()))
        .await
        .expect("seed anime");

    let scoped_paths = vec![
        format!("/api/anime/{anime_id}"),
        format!("/api/anime/{anime_id}/rename-preview"),
        format!("/api/anime/{anime_id}/episodes"),
        format!("/api/anime/{anime_id}/episodes/missing"),
        format!("/api/anime/{anime_id}/episodes/1"),
        format!("/api/anime/{anime_id}/files"),
        format!("/api/anime/{anime_id}/rss"),
    ];

    for path in scoped_paths {
        let response = request(
            &app,
            Method::GET,
            path.clone(),
            &api_key,
            Body::empty(),
            None,
        )
        .await;
        assert!(
            !response.status().is_server_error(),
            "{} returned {}",
            path,
            response.status()
        );
    }

    for (method, path, payload) in [
        (
            Method::POST,
            format!("/api/anime/{anime_id}/monitor"),
            serde_json::json!({ "monitored": false }).to_string(),
        ),
        (
            Method::PUT,
            format!("/api/anime/{anime_id}/profile"),
            serde_json::json!({ "profile_name": "Default" }).to_string(),
        ),
        (
            Method::PUT,
            format!("/api/anime/{anime_id}/path"),
            serde_json::json!({ "path": anime_folder, "rescan": false }).to_string(),
        ),
        (
            Method::POST,
            format!("/api/anime/{anime_id}/episodes/scan"),
            String::new(),
        ),
        (
            Method::POST,
            format!("/api/anime/{anime_id}/rename"),
            String::new(),
        ),
        (
            Method::POST,
            format!("/api/anime/{anime_id}/episodes/1/map"),
            serde_json::json!({ "file_path": "/tmp/not-found.mkv" }).to_string(),
        ),
        (
            Method::POST,
            format!("/api/anime/{anime_id}/episodes/map/bulk"),
            serde_json::json!({ "mappings": [{ "episode_number": 1, "file_path": "/tmp/not-found.mkv" }] }).to_string(),
        ),
        (
            Method::DELETE,
            format!("/api/anime/{anime_id}/episodes/1/file"),
            String::new(),
        ),
    ] {
        let response = request(
            &app,
            method,
            path.clone(),
            &api_key,
            if payload.is_empty() {
                Body::empty()
            } else {
                Body::from(payload)
            },
            Some("application/json"),
        )
        .await;
        assert!(
            !response.status().is_server_error(),
            "{} returned {}",
            path,
            response.status()
        );
    }

    let add_feed = request(
        &app,
        Method::POST,
        "/api/rss".to_string(),
        &api_key,
        Body::from(
            serde_json::json!({
                "anime_id": anime_id,
                "url": "https://example.test/rss",
                "name": "API Feed"
            })
            .to_string(),
        ),
        Some("application/json"),
    )
    .await;
    assert_eq!(add_feed.status(), StatusCode::OK);

    let add_feed_body = add_feed
        .into_body()
        .collect()
        .await
        .expect("rss body")
        .to_bytes();
    let add_feed_json: serde_json::Value =
        serde_json::from_slice(&add_feed_body).expect("rss json body");
    let feed_id = add_feed_json["data"]["id"]
        .as_i64()
        .expect("rss feed id in response");

    for (method, path, payload) in [
        (
            Method::PUT,
            format!("/api/rss/{feed_id}/toggle"),
            serde_json::json!({ "enabled": false }).to_string(),
        ),
        (Method::DELETE, format!("/api/rss/{feed_id}"), String::new()),
    ] {
        let response = request(
            &app,
            method,
            path.clone(),
            &api_key,
            if payload.is_empty() {
                Body::empty()
            } else {
                Body::from(payload)
            },
            Some("application/json"),
        )
        .await;
        assert!(
            !response.status().is_server_error(),
            "{} returned {}",
            path,
            response.status()
        );
    }

    let release_create = request(
        &app,
        Method::POST,
        "/api/release-profiles".to_string(),
        &api_key,
        Body::from(
            serde_json::json!({
                "name": "API Release Profile",
                "enabled": true,
                "is_global": false,
                "rules": [{
                    "term": "SubsPlease",
                    "score": 100,
                    "rule_type": "preferred"
                }]
            })
            .to_string(),
        ),
        Some("application/json"),
    )
    .await;
    assert_eq!(release_create.status(), StatusCode::OK);

    let release_body = release_create
        .into_body()
        .collect()
        .await
        .expect("release profile body")
        .to_bytes();
    let release_json: serde_json::Value =
        serde_json::from_slice(&release_body).expect("release profile json");
    let release_id = release_json["data"]["id"]
        .as_i64()
        .expect("release profile id");

    for (method, path, payload) in [
        (
            Method::PUT,
            format!("/api/release-profiles/{release_id}"),
            serde_json::json!({
                "name": "API Release Profile Updated",
                "enabled": true,
                "is_global": false,
                "rules": [{
                    "term": "BestGroup",
                    "score": 200,
                    "rule_type": "preferred"
                }]
            })
            .to_string(),
        ),
        (
            Method::DELETE,
            format!("/api/release-profiles/{release_id}"),
            String::new(),
        ),
    ] {
        let response = request(
            &app,
            method,
            path.clone(),
            &api_key,
            if payload.is_empty() {
                Body::empty()
            } else {
                Body::from(payload)
            },
            Some("application/json"),
        )
        .await;
        assert!(
            !response.status().is_server_error(),
            "{} returned {}",
            path,
            response.status()
        );
    }

    let incoming = std::env::temp_dir().join(format!("bakarr-api-import-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&incoming)
        .await
        .expect("create incoming dir");
    let source_file = incoming.join("[SubsPlease] API Smoke Anime - 01 (1080p).mkv");
    tokio::fs::write(&source_file, b"video-bytes")
        .await
        .expect("write source file");

    for (path, payload) in [
        (
            "/api/library/import/scan".to_string(),
            serde_json::json!({ "path": incoming, "anime_id": anime_id }).to_string(),
        ),
        (
            "/api/library/import".to_string(),
            serde_json::json!({
                "files": [{
                    "source_path": source_file,
                    "anime_id": anime_id,
                    "episode_number": 1,
                    "season": 1
                }]
            })
            .to_string(),
        ),
    ] {
        let response = request(
            &app,
            Method::POST,
            path.clone(),
            &api_key,
            Body::from(payload),
            Some("application/json"),
        )
        .await;
        assert!(
            !response.status().is_server_error(),
            "{} returned {}",
            path,
            response.status()
        );
    }

    let browse = request(
        &app,
        Method::GET,
        format!("/api/library/browse?path={library_root}"),
        &api_key,
        Body::empty(),
        None,
    )
    .await;
    assert!(
        !browse.status().is_server_error(),
        "browse route returned {}",
        browse.status()
    );
}
