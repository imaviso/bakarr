//! Regression tests for backend hardening workstreams.

use bakarr::config::Config;
use bakarr::models::anime::{Anime, AnimeTitle};

fn test_anime(id: i32) -> Anime {
    Anime {
        id,
        title: AnimeTitle {
            romaji: format!("Regression Anime {id}"),
            english: None,
            native: None,
        },
        format: "TV".to_string(),
        episode_count: Some(12),
        status: "FINISHED".to_string(),
        quality_profile_id: Some(1),
        cover_image: None,
        banner_image: None,
        added_at: chrono::Utc::now().to_rfc3339(),
        profile_name: Some("Default".to_string()),
        path: Some("/library".to_string()),
        mal_id: None,
        description: None,
        score: None,
        genres: None,
        studios: None,
        start_year: Some(2024),
        monitored: true,
        metadata_provenance: None,
    }
}

async fn spawn_store() -> bakarr::db::Store {
    let db_path = std::env::temp_dir().join(format!("bakarr-ws-test-{}.db", uuid::Uuid::new_v4()));

    let mut config = Config::default();
    config.general.database_path = format!("sqlite:{}", db_path.display());
    config.qbittorrent.enabled = false;

    let state = bakarr::api::create_app_state_from_config(config, None)
        .await
        .expect("failed to create app state");

    state.store().clone()
}

#[tokio::test]
async fn mark_episode_downloaded_reassigns_path_atomically() {
    let store = spawn_store().await;
    let anime = test_anime(10001);

    store.add_anime(&anime).await.expect("add anime");

    let shared_path = "/downloads/shared/episode.mkv";

    store
        .mark_episode_downloaded(anime.id, 1, 1, 3, false, shared_path, Some(100), None)
        .await
        .expect("mark episode 1 downloaded");

    store
        .mark_episode_downloaded(anime.id, 2, 1, 3, false, shared_path, Some(120), None)
        .await
        .expect("mark episode 2 downloaded");

    let ep1 = store
        .get_episode_status(anime.id, 1)
        .await
        .expect("get ep1")
        .expect("ep1 status row");
    let ep2 = store
        .get_episode_status(anime.id, 2)
        .await
        .expect("get ep2")
        .expect("ep2 status row");

    assert_eq!(ep1.file_path, None);
    assert_eq!(ep1.downloaded_at, None);
    assert_eq!(ep2.file_path.as_deref(), Some(shared_path));
    assert!(ep2.downloaded_at.is_some());
}
