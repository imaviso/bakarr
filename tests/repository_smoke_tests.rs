use bakarr::clients::seadex::SeaDexRelease;
use bakarr::config::{Config, QualityProfileConfig};
use bakarr::models::anime::{Anime, AnimeTitle};
use bakarr::models::episode::EpisodeInput;
use bakarr::services::download::DownloadAction;
use bakarr::services::search::SearchResult;
use sea_orm::Set;

async fn spawn_store() -> bakarr::db::Store {
    let db_path = std::env::temp_dir().join(format!(
        "bakarr-repo-smoke-test-{}.db",
        uuid::Uuid::new_v4()
    ));

    let mut config = Config::default();
    config.general.database_path = format!("sqlite:{}", db_path.display());
    config.qbittorrent.enabled = false;

    let state = bakarr::api::create_app_state_from_config(config, None)
        .await
        .expect("failed to create app state");

    state.store().clone()
}

fn test_anime(id: i32) -> Anime {
    Anime {
        id,
        title: AnimeTitle {
            romaji: format!("Repo Smoke Anime {id}"),
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
        path: Some("/tmp/repo-smoke-anime".to_string()),
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

#[tokio::test]
async fn repositories_anime_download_rss_and_logs_roundtrip() {
    let store = spawn_store().await;
    let anime = test_anime(41001);

    store.add_anime(&anime).await.expect("add anime");
    assert!(
        store
            .get_anime(anime.id)
            .await
            .expect("get anime")
            .is_some()
    );

    store
        .record_download(
            anime.id,
            "[SubsPlease] Repo Smoke Anime - 01 (1080p).mkv",
            1.0,
            Some("SubsPlease"),
            Some("repohash01"),
        )
        .await
        .expect("record download");

    let download = store
        .get_download_by_hash("repohash01")
        .await
        .expect("fetch download");
    assert!(download.is_some());

    store
        .add_to_blocklist("repohash01", "test")
        .await
        .expect("add blocklist");
    assert!(store.is_blocked("repohash01").await.expect("is blocked"));

    let feed_id = store
        .add_rss_feed(anime.id, "https://example.test/rss", Some("Repo Feed"))
        .await
        .expect("add rss feed");
    assert!(
        store
            .get_rss_feed(feed_id)
            .await
            .expect("get feed")
            .is_some()
    );

    store
        .toggle_rss_feed(feed_id, false)
        .await
        .expect("toggle rss feed");
    store
        .update_rss_feed_checked(feed_id, Some("item-hash"))
        .await
        .expect("update rss feed checked");

    let feed = store
        .get_rss_feed(feed_id)
        .await
        .expect("get feed after update")
        .expect("feed should exist");
    assert!(!feed.enabled);
    assert_eq!(feed.last_item_hash.as_deref(), Some("item-hash"));

    store
        .add_log("Info", "info", "hello", None)
        .await
        .expect("add log");
    let (logs, _) = store
        .get_logs(1, 20, None, None, None, None)
        .await
        .expect("get logs");
    assert!(!logs.is_empty());

    store.clear_logs().await.expect("clear logs");
    let (logs_after_clear, _) = store
        .get_logs(1, 20, None, None, None, None)
        .await
        .expect("get logs after clear");
    assert!(logs_after_clear.is_empty());

    assert!(
        store
            .remove_rss_feed(feed_id)
            .await
            .expect("remove rss feed")
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn repositories_episode_and_cache_roundtrip() {
    let store = spawn_store().await;
    let anime = test_anime(41002);
    store.add_anime(&anime).await.expect("add anime");

    let episodes = vec![
        EpisodeInput {
            episode_number: 1,
            title: Some("Episode 1".to_string()),
            title_japanese: None,
            aired: None,
            filler: false,
            recap: false,
            metadata_provenance: None,
        },
        EpisodeInput {
            episode_number: 2,
            title: Some("Episode 2".to_string()),
            title_japanese: None,
            aired: None,
            filler: false,
            recap: false,
            metadata_provenance: None,
        },
    ];

    store
        .cache_episodes(anime.id, &episodes)
        .await
        .expect("cache episodes");
    assert!(
        store
            .has_cached_episodes(anime.id)
            .await
            .expect("has cached episodes")
    );

    let title = store
        .get_episode_title(anime.id, 1)
        .await
        .expect("get episode title");
    assert_eq!(title.as_deref(), Some("Episode 1"));

    store
        .mark_episode_downloaded(
            anime.id,
            1,
            1,
            3,
            false,
            "/tmp/repo-smoke-ep1.mkv",
            Some(1024),
            None,
        )
        .await
        .expect("mark episode downloaded");

    let status = store
        .get_episode_status(anime.id, 1)
        .await
        .expect("get episode status")
        .expect("status should exist");
    assert_eq!(status.file_path.as_deref(), Some("/tmp/repo-smoke-ep1.mkv"));

    let missing = store
        .get_missing_episodes(anime.id, 3)
        .await
        .expect("get missing episodes");
    assert_eq!(missing, vec![2, 3]);

    store
        .clear_episode_download(anime.id, 1)
        .await
        .expect("clear episode download");

    let cached_results = vec![SearchResult {
        title: "Result 1".to_string(),
        indexer: "Nyaa".to_string(),
        link: "magnet:?xt=urn:btih:abcd".to_string(),
        info_hash: "abcd".to_string(),
        size: 123,
        seeders: 10,
        leechers: 1,
        publish_date: "2026-01-01T00:00:00Z".to_string(),
        download_action: DownloadAction::Reject {
            reason: "test".to_string(),
        },
        quality: "WEB-DL 1080p".to_string(),
        group: Some("SubsPlease".to_string()),
        episode_number: 1.0,
    }];

    store
        .cache_search_results("repo-smoke-query", &cached_results)
        .await
        .expect("cache search results");
    let loaded = store
        .get_cached_search("repo-smoke-query")
        .await
        .expect("get cached search");
    assert_eq!(loaded.as_ref().map(Vec::len), Some(1));

    let releases = vec![SeaDexRelease {
        id: "release-1".to_string(),
        release_group: "GroupA".to_string(),
        dual_audio: false,
        info_hash: Some("seadexhash".to_string()),
        url: "https://example.test/torrent".to_string(),
        is_best: true,
        tracker: None,
        tags: vec![],
    }];

    store
        .cache_seadex(anime.id, &["GroupA".to_string()], Some("GroupA"), &releases)
        .await
        .expect("cache seadex");

    let cache = store
        .get_seadex_cache(anime.id)
        .await
        .expect("get seadex cache")
        .expect("cache should exist");
    assert_eq!(cache.get_groups(), vec!["GroupA".to_string()]);
    assert!(
        store
            .is_seadex_cache_fresh(anime.id)
            .await
            .expect("seadex freshness")
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn repositories_quality_release_profile_and_metadata_roundtrip() {
    let store = spawn_store().await;
    let anime = test_anime(41003);
    store.add_anime(&anime).await.expect("add anime");

    assert!(
        store
            .get_quality_profile_by_name("Default")
            .await
            .expect("get default profile")
            .is_some()
    );

    let mut profiles = Config::default().profiles;
    profiles.push(QualityProfileConfig {
        name: "RepoTestProfile".to_string(),
        cutoff: "WEB-DL 1080p".to_string(),
        upgrade_allowed: true,
        seadex_preferred: false,
        allowed_qualities: vec!["WEB-DL 1080p".to_string(), "WEB-DL 720p".to_string()],
        min_size: None,
        max_size: None,
    });

    store.sync_profiles(&profiles).await.expect("sync profiles");
    let profile = store
        .get_quality_profile_by_name("RepoTestProfile")
        .await
        .expect("get synced profile");
    assert!(profile.is_some());

    let created = store
        .create_release_profile(
            "Repo Rule".to_string(),
            true,
            false,
            vec![
                bakarr::db::repositories::release_profile::ReleaseProfileRuleDto {
                    term: "SubsPlease".to_string(),
                    score: 100,
                    rule_type: "preferred".to_string(),
                },
            ],
        )
        .await
        .expect("create release profile");

    store
        .assign_release_profiles_to_anime(anime.id, &[created.id])
        .await
        .expect("assign release profile");
    let assigned = store
        .get_assigned_release_profile_ids(anime.id)
        .await
        .expect("get assigned profiles");
    assert_eq!(assigned, vec![created.id]);

    let rules = store
        .get_release_rules_for_anime(anime.id)
        .await
        .expect("get release rules");
    assert!(!rules.is_empty());

    store
        .update_release_profile(
            created.id,
            "Repo Rule Updated".to_string(),
            true,
            false,
            vec![
                bakarr::db::repositories::release_profile::ReleaseProfileRuleDto {
                    term: "BestGroup".to_string(),
                    score: 200,
                    rule_type: "preferred".to_string(),
                },
            ],
        )
        .await
        .expect("update release profile");

    store
        .delete_release_profile(created.id)
        .await
        .expect("delete release profile");

    store
        .clear_anime_metadata()
        .await
        .expect("clear metadata before insert");
    assert!(
        store
            .is_anime_metadata_empty()
            .await
            .expect("metadata empty before insert")
    );

    store
        .batch_insert_anime_metadata(vec![bakarr::entities::anime_metadata::ActiveModel {
            id: Set(1),
            anilist_id: Set(Some(12345)),
            mal_id: Set(Some(54321)),
            anidb_id: Set(None),
            kitsu_id: Set(None),
            title: Set("Repo Meta Anime".to_string()),
            synonyms: Set(None),
            r#type: Set(Some("TV".to_string())),
            status: Set(Some("RELEASING".to_string())),
            season: Set(None),
            year: Set(Some(2026)),
        }])
        .await
        .expect("batch insert metadata");

    assert!(
        store
            .get_anime_metadata_by_anilist_id(12345)
            .await
            .expect("get metadata by anilist")
            .is_some()
    );
    assert!(
        store
            .get_anime_metadata_by_mal_id(54321)
            .await
            .expect("get metadata by mal")
            .is_some()
    );

    store.clear_anime_metadata().await.expect("clear metadata");
    assert!(
        store
            .is_anime_metadata_empty()
            .await
            .expect("metadata empty after clear")
    );
}
