use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, interval};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{debug, error, info, warn};

use crate::clients::nyaa::{NyaaClient, NyaaTorrent};
use crate::clients::qbittorrent::{AddTorrentOptions, QBitClient, QBitConfig};
use crate::clients::seadex::{SeaDexClient, SeaDexRelease};
use crate::config::{Config, SchedulerConfig};
use crate::db::Store;
use crate::library::RecycleBin;
use crate::models::anime::Anime;
use crate::services::search::SearchResult;
use crate::services::{DownloadDecisionService, EpisodeService};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub store: Store,
    pub nyaa: Arc<NyaaClient>,
    pub seadex: Arc<SeaDexClient>,
    pub qbit: Option<Arc<QBitClient>>,
    pub episodes: EpisodeService,
    pub download_decisions: DownloadDecisionService,
    pub search_service: Arc<crate::services::SearchService>,
    pub recycle_bin: RecycleBin,
    pub event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
}

impl AppState {
    pub async fn get_seadex_groups_cached(&self, anime_id: i32) -> Vec<String> {
        if let Ok(true) = self.store.is_seadex_cache_fresh(anime_id).await
            && let Ok(Some(cache)) = self.store.get_seadex_cache(anime_id).await
        {
            return cache.get_groups();
        }

        if !self.config.downloads.use_seadex {
            return self.config.downloads.preferred_groups.clone();
        }

        match self.seadex.get_best_for_anime(anime_id).await {
            Ok(releases) => {
                let groups: Vec<String> =
                    releases.iter().map(|r| r.release_group.clone()).collect();
                let best_release = releases.first().map(|r| r.release_group.as_str());

                if let Err(e) = self
                    .store
                    .cache_seadex(anime_id, &groups, best_release, &releases)
                    .await
                {
                    debug!("Failed to cache SeaDex results: {}", e);
                }

                groups
            }
            Err(e) => {
                debug!("SeaDex lookup failed: {}", e);
                self.config.downloads.preferred_groups.clone()
            }
        }
    }

    pub async fn get_seadex_releases_cached(&self, anime_id: i32) -> Vec<SeaDexRelease> {
        if let Ok(true) = self.store.is_seadex_cache_fresh(anime_id).await
            && let Ok(Some(cache)) = self.store.get_seadex_cache(anime_id).await
        {
            let releases = cache.get_releases();
            if !releases.is_empty() {
                return releases;
            }
        }

        if !self.config.downloads.use_seadex {
            return vec![];
        }

        match self.seadex.get_best_for_anime(anime_id).await {
            Ok(releases) => {
                let groups: Vec<String> =
                    releases.iter().map(|r| r.release_group.clone()).collect();
                let best_release = releases.first().map(|r| r.release_group.as_str());

                if let Err(e) = self
                    .store
                    .cache_seadex(anime_id, &groups, best_release, &releases)
                    .await
                {
                    debug!("Failed to cache SeaDex releases: {}", e);
                }

                releases
            }
            Err(e) => {
                debug!("SeaDex lookup failed: {}", e);
                vec![]
            }
        }
    }

    pub fn is_from_seadex_group(&self, title: &str, seadex_groups: &[String]) -> bool {
        if seadex_groups.is_empty() {
            return false;
        }
        let title_lower = title.to_lowercase();
        seadex_groups
            .iter()
            .any(|g| title_lower.contains(&g.to_lowercase()))
    }

    pub async fn new(
        config: Config,
        event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
    ) -> Result<Self> {
        let store = Store::new(&config.general.database_path).await?;

        let nyaa = Arc::new(NyaaClient::new());
        let seadex = Arc::new(SeaDexClient::new());

        let qbit = if config.qbittorrent.enabled {
            let qbit_config = QBitConfig {
                base_url: config.qbittorrent.url.clone(),
                username: config.qbittorrent.username.clone(),
                password: config.qbittorrent.password.clone(),
            };
            let client = QBitClient::new(qbit_config);
            if client.is_available().await {
                info!("qBittorrent connected");
                Some(Arc::new(client))
            } else {
                warn!("qBittorrent not available, downloads will be skipped");
                None
            }
        } else {
            None
        };

        let episodes = EpisodeService::new(store.clone());
        let download_decisions = DownloadDecisionService::new(store.clone());
        let search_service = Arc::new(crate::services::SearchService::new(
            store.clone(),
            (*nyaa).clone(),
            (*seadex).clone(),
            download_decisions.clone(),
            config.clone(),
        ));

        let recycle_bin = RecycleBin::new(
            &config.library.recycle_path,
            config.library.recycle_cleanup_days,
        );

        Ok(Self {
            config,
            store,
            nyaa,
            seadex,
            qbit,
            episodes,
            download_decisions,
            search_service,
            recycle_bin,
            event_bus,
        })
    }
}

pub struct Scheduler {
    state: Arc<RwLock<AppState>>,
    config: SchedulerConfig,
    running: Arc<RwLock<bool>>,
}

impl Scheduler {
    pub fn new(state: Arc<RwLock<AppState>>, config: SchedulerConfig) -> Self {
        Self {
            state,
            config,
            running: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn start(&self) -> Result<()> {
        if !self.config.enabled {
            info!("Scheduler is disabled in config");
            return Ok(());
        }

        *self.running.write().await = true;
        info!("Starting background scheduler");

        if let Some(cron_expr) = &self.config.cron_expression {
            self.run_with_cron(cron_expr).await
        } else {
            self.run_with_interval().await
        }
    }

    async fn run_with_cron(&self, cron_expr: &str) -> Result<()> {
        let mut sched = JobScheduler::new().await?;

        let state = Arc::clone(&self.state);
        let running = Arc::clone(&self.running);
        let delay_secs = self.config.check_delay_seconds;

        let job = Job::new_async(cron_expr, move |_uuid, _lock| {
            let state = Arc::clone(&state);
            let running = Arc::clone(&running);
            Box::pin(async move {
                if !*running.read().await {
                    return;
                }
                if let Err(e) = check_all_anime(Arc::clone(&state), delay_secs).await {
                    error!("Scheduled anime check failed: {}", e);
                }
                if let Err(e) = check_rss_feeds(Arc::clone(&state), delay_secs).await {
                    error!("Scheduled RSS check failed: {}", e);
                }
            })
        })?;

        let metadata_job = Job::new_async("0 0 */12 * * *", move |_uuid, _lock| {
            Box::pin(async move {})
        })?;

        sched.add(job).await?;
        sched.add(metadata_job).await?;
        sched.start().await?;

        info!("Scheduler running with cron: {}", cron_expr);

        loop {
            if !*self.running.read().await {
                break;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        sched.shutdown().await?;
        Ok(())
    }

    async fn run_with_interval(&self) -> Result<()> {
        let interval_mins = self.config.check_interval_minutes;
        let delay_secs = self.config.check_delay_seconds;

        info!("Scheduler running every {} minutes", interval_mins);

        let mut check_interval = interval(Duration::from_secs(interval_mins as u64 * 60));

        let mut metadata_interval = interval(Duration::from_secs(12 * 60 * 60));

        loop {
            tokio::select! {
                _ = check_interval.tick() => {
                    if !*self.running.read().await {
                        break;
                    }
                    info!("Running scheduled checks...");
                    if let Err(e) = check_all_anime(Arc::clone(&self.state), delay_secs).await {
                        error!("Scheduled anime check failed: {}", e);
                    }
                    if let Err(e) = check_rss_feeds(Arc::clone(&self.state), delay_secs).await {
                        error!("Scheduled RSS check failed: {}", e);
                    }
                }
                _ = metadata_interval.tick() => {
                    if !*self.running.read().await {
                        break;
                    }
                    if let Err(e) = self.refresh_metadata().await {
                        error!("Scheduled metadata refresh failed: {}", e);
                    }
                }
            }
        }

        Ok(())
    }

    pub async fn stop(&self) {
        info!("Stopping scheduler...");
        *self.running.write().await = false;
    }

    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }

    pub async fn run_once(&self) -> Result<()> {
        info!("Running manual check...");

        check_all_anime(Arc::clone(&self.state), self.config.check_delay_seconds).await?;

        check_rss_feeds(Arc::clone(&self.state), self.config.check_delay_seconds).await?;

        self.refresh_metadata().await?;

        Ok(())
    }

    async fn refresh_metadata(&self) -> Result<()> {
        info!("Refreshing metadata for airng anime...");
        let state = self.state.read().await.clone();

        let monitored = state.store.list_monitored().await?;
        let releasing: Vec<_> = monitored
            .into_iter()
            .filter(|a| a.status == "RELEASING" || a.status == "NOT_YET_RELEASED")
            .collect();

        info!("Found {} anime to refresh metadata for", releasing.len());

        for anime in releasing {
            if let Err(e) = state.episodes.fetch_and_cache_episodes(anime.id).await {
                warn!(
                    "Failed to refresh metadata for {}: {}",
                    anime.title.romaji, e
                );
            }

            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        info!("Metadata refresh complete");
        Ok(())
    }
}

async fn check_all_anime(state: Arc<RwLock<AppState>>, delay_secs: u32) -> Result<()> {
    let state = state.read().await.clone();

    let monitored = state.store.list_monitored().await?;
    info!(
        "Checking {} monitored anime via Nyaa search",
        monitored.len()
    );

    for anime in monitored {
        if !anime.monitored {
            continue;
        }

        if let Err(e) = check_anime_releases(&state, &anime).await {
            warn!("Error checking {}: {}", anime.title.romaji, e);
        }

        if delay_secs > 0 {
            tokio::time::sleep(Duration::from_secs(delay_secs as u64)).await;
        }
    }

    info!("Anime search check complete");
    Ok(())
}

async fn check_rss_feeds(state: Arc<RwLock<AppState>>, delay_secs: u32) -> Result<()> {
    let state = state.read().await.clone();

    let feeds = state.store.get_enabled_rss_feeds().await?;

    if feeds.is_empty() {
        debug!("No RSS feeds configured");
        return Ok(());
    }

    info!("Checking {} RSS feeds", feeds.len());

    let monitored = state.store.list_monitored().await?;

    for feed in feeds {
        let anime = monitored.iter().find(|a| a.id == feed.anime_id);

        if anime.is_none() {
            warn!(
                "RSS feed {} references unknown anime {}",
                feed.id, feed.anime_id
            );
            continue;
        }
        let anime = anime.unwrap();

        if !anime.monitored {
            continue;
        }

        let feed_name = feed.name.as_deref().unwrap_or("Unnamed");
        debug!("Checking RSS feed: {}", feed_name);

        match state
            .nyaa
            .check_feed_for_new(&feed.url, feed.last_item_hash.as_deref())
            .await
        {
            Ok((new_items, new_hash)) => {
                if let Err(e) = state
                    .store
                    .update_rss_feed_checked(feed.id, new_hash.as_deref())
                    .await
                {
                    warn!("Failed to update feed {} check status: {}", feed.id, e);
                }

                if new_items.is_empty() {
                    debug!("No new items in feed: {}", feed_name);
                    continue;
                }

                info!(
                    "Found {} new items in RSS feed: {}",
                    new_items.len(),
                    feed_name
                );

                for torrent in new_items {
                    if let Err(e) = process_rss_torrent(&state, anime, &torrent).await {
                        warn!("Error processing RSS item: {}", e);
                    }
                }
            }
            Err(e) => {
                warn!("Failed to fetch RSS feed {}: {}", feed_name, e);
            }
        }

        if delay_secs > 0 {
            tokio::time::sleep(Duration::from_secs(delay_secs as u64)).await;
        }
    }

    info!("RSS feed check complete");
    Ok(())
}

async fn process_rss_torrent(state: &AppState, anime: &Anime, torrent: &NyaaTorrent) -> Result<()> {
    use crate::parser::filename::parse_filename;

    if state.store.is_downloaded(&torrent.title).await? {
        debug!("Already downloaded: {}", torrent.title);
        return Ok(());
    }

    let (episode_number, group) = if let Some(parsed) = parse_filename(&torrent.title) {
        (parsed.episode_number, parsed.group)
    } else {
        (0.0, None)
    };

    info!(
        "[RSS] New release: {} - Episode {} [{}]",
        anime.title.romaji,
        episode_number,
        group.as_deref().unwrap_or("Unknown")
    );

    if let Some(qbit) = &state.qbit {
        let category = crate::clients::qbittorrent::sanitize_category(&anime.title.romaji);
        let _ = qbit.create_category(&category, None).await;

        let magnet = torrent.magnet_link();
        let options = AddTorrentOptions {
            category: Some(category.clone()),
            save_path: None,
            ..Default::default()
        };

        match qbit.add_torrent_url(&magnet, Some(options)).await {
            Ok(_) => {
                info!("✓ [RSS] Queued: {} in category {}", torrent.title, category);

                state
                    .store
                    .record_download(
                        anime.id,
                        &torrent.title,
                        episode_number,
                        group.as_deref(),
                        Some(&torrent.info_hash),
                    )
                    .await?;
            }
            Err(e) => {
                warn!("Failed to queue RSS torrent: {}", e);
            }
        }
    } else {
        info!(
            "[RSS] Would download (qBit not available): {}",
            torrent.title
        );
    }

    Ok(())
}

async fn queue_download_from_result(
    state: &AppState,
    anime: &Anime,
    result: &SearchResult,
    quality: &crate::quality::Quality,
    is_seadex: bool,
) -> Result<()> {
    let Some(qbit) = &state.qbit else {
        info!("Would download (qBit not available): {}", result.title);
        return Ok(());
    };

    let category = crate::clients::qbittorrent::sanitize_category(&anime.title.romaji);
    let _ = qbit.create_category(&category, None).await;

    let options = AddTorrentOptions {
        category: Some(category.clone()),
        save_path: None,
        ..Default::default()
    };

    match qbit.add_torrent_url(&result.link, Some(options)).await {
        Ok(_) => {
            info!(
                "✓ Queued: {} [{}{}]",
                result.title,
                quality,
                if is_seadex { ", SeaDex" } else { "" }
            );

            state
                .store
                .record_download(
                    anime.id,
                    &result.title,
                    result.episode_number,
                    result.group.as_deref(),
                    Some(&result.info_hash),
                )
                .await?;
        }
        Err(e) => {
            warn!("Failed to queue torrent: {}", e);
        }
    }

    Ok(())
}

async fn check_anime_releases(state: &AppState, anime: &Anime) -> Result<()> {
    debug!("Checking: {}", anime.title.romaji);

    if anime.status == "FINISHED"
        && let Ok(true) = check_finished_anime_seadex(state, anime).await
    {
        info!(
            "Found and queued Seadex batch for {}, skipping individual episode search",
            anime.title.romaji
        );
        return Ok(());
    }

    let results = state.search_service.search_anime(anime.id).await?;

    if results.is_empty() {
        debug!("No matching releases for {}", anime.title.romaji);
        return Ok(());
    }

    for result in results.iter().take(10) {
        if state.store.is_downloaded(&result.title).await? {
            debug!("Already downloaded exact file: {}", result.title);
            continue;
        }

        let episode_number = result.episode_number as i32;

        match &result.download_action {
            crate::services::download::DownloadAction::Accept { quality, is_seadex } => {
                info!(
                    "New release: {} - Episode {} [{}, {}{}]",
                    anime.title.romaji,
                    episode_number,
                    quality,
                    result.group.as_deref().unwrap_or("Unknown"),
                    if *is_seadex { ", SeaDex" } else { "" }
                );

                queue_download_from_result(state, anime, result, quality, *is_seadex).await?;
            }
            crate::services::download::DownloadAction::Upgrade {
                quality,
                is_seadex,
                reason,
                old_file_path,
                old_quality,
            } => {
                info!(
                    "Upgrading {} - Episode {} [{} -> {}, {}]",
                    anime.title.romaji, episode_number, old_quality, quality, reason
                );

                if let Some(old_path) = old_file_path {
                    let path = std::path::Path::new(old_path);
                    if path.exists() {
                        match state.recycle_bin.recycle(path, "upgrade").await {
                            Ok(recycled) => {
                                let _ = state
                                    .store
                                    .add_to_recycle_bin(
                                        old_path,
                                        recycled.recycled_path.to_str(),
                                        anime.id,
                                        episode_number,
                                        Some(old_quality.id),
                                        recycled.file_size,
                                        "upgrade",
                                    )
                                    .await;
                                info!("Moved old file to recycle bin: {:?}", old_path);
                            }
                            Err(e) => {
                                warn!("Failed to recycle old file: {}", e);
                            }
                        }
                    }
                }

                queue_download_from_result(state, anime, result, quality, *is_seadex).await?;
            }
            crate::services::download::DownloadAction::Reject { reason } => {
                debug!(
                    "Skipping {} - Episode {}: {}",
                    anime.title.romaji, episode_number, reason
                );
            }
        }
    }

    Ok(())
}

async fn check_finished_anime_seadex(state: &AppState, anime: &Anime) -> Result<bool> {
    if !state.config.downloads.use_seadex {
        return Ok(false);
    }

    let releases = state.get_seadex_releases_cached(anime.id).await;
    if releases.is_empty() {
        return Ok(false);
    }

    let mut found_batch = false;

    for release in releases.iter().take(3) {
        let Some(hash) = &release.info_hash else {
            continue;
        };

        if hash.len() != 40 {
            continue;
        }

        if state.store.is_blocked(hash).await.unwrap_or(false) {
            continue;
        }

        if state.store.get_download_by_hash(hash).await?.is_some() {
            found_batch = true;
            continue;
        }

        if let Some(qbit) = &state.qbit {
            let category = crate::clients::qbittorrent::sanitize_category(&anime.title.romaji);
            let _ = qbit.create_category(&category, None).await;

            let options = AddTorrentOptions {
                category: Some(category.clone()),
                save_path: None,
                ..Default::default()
            };

            match qbit.add_torrent_url(&release.url, Some(options)).await {
                Ok(_) => {
                    info!(
                        "✓ Queued Seadex Batch: {} [{}]",
                        anime.title.romaji, release.release_group
                    );

                    state
                        .store
                        .record_download(
                            anime.id,
                            &format!("{} - {}", anime.title.romaji, release.release_group),
                            -1.0,
                            Some(&release.release_group),
                            Some(hash),
                        )
                        .await?;

                    found_batch = true;

                    break;
                }
                Err(e) => {
                    warn!("Failed to queue Seadex batch: {}", e);
                }
            }
        } else {
            info!(
                "Would download Seadex Batch (qBit not available): {} [{}]",
                anime.title.romaji, release.release_group
            );
            found_batch = true;
            break;
        }
    }

    Ok(found_batch)
}
