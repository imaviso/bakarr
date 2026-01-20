use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, interval};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{debug, error, info, warn};

use crate::clients::nyaa::NyaaTorrent;
use crate::clients::qbittorrent::AddTorrentOptions;
use crate::config::SchedulerConfig;
use crate::models::anime::Anime;
use crate::services::search::SearchResult;
use crate::state::SharedState;

/// Type alias for scheduler state - uses SharedState wrapped in Arc<RwLock> for thread-safety.
pub type SchedulerState = Arc<RwLock<SharedState>>;

pub struct Scheduler {
    state: SchedulerState,
    config: SchedulerConfig,
    running: Arc<RwLock<bool>>,
}

impl Scheduler {
    pub fn new(state: SchedulerState, config: SchedulerConfig) -> Self {
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
        info!("Refreshing metadata for airing anime...");
        let state = self.state.read().await;

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

async fn check_all_anime(state: SchedulerState, delay_secs: u32) -> Result<()> {
    let state = state.read().await;

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

async fn check_rss_feeds(state: SchedulerState, delay_secs: u32) -> Result<()> {
    let state = state.read().await;

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

async fn process_rss_torrent(
    state: &SharedState,
    anime: &Anime,
    torrent: &NyaaTorrent,
) -> Result<()> {
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
    state: &SharedState,
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

async fn check_anime_releases(state: &SharedState, anime: &Anime) -> Result<()> {
    debug!("Checking: {}", anime.title.romaji);

    // For finished anime, try to find SeaDex batch releases first
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

        process_search_result(state, anime, result).await?;
    }

    Ok(())
}

/// Process a single search result and take appropriate action (accept, upgrade, or reject).
async fn process_search_result(
    state: &SharedState,
    anime: &Anime,
    result: &SearchResult,
) -> Result<()> {
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

            handle_upgrade_recycle(state, anime.id, episode_number, old_file_path, old_quality)
                .await;

            queue_download_from_result(state, anime, result, quality, *is_seadex).await?;
        }
        crate::services::download::DownloadAction::Reject { reason } => {
            debug!(
                "Skipping {} - Episode {}: {}",
                anime.title.romaji, episode_number, reason
            );
        }
    }

    Ok(())
}

/// Move old file to recycle bin when upgrading to a better quality release.
async fn handle_upgrade_recycle(
    state: &SharedState,
    anime_id: i32,
    episode_number: i32,
    old_file_path: &Option<String>,
    old_quality: &crate::quality::Quality,
) {
    let Some(old_path) = old_file_path else {
        return;
    };

    let path = std::path::Path::new(old_path);
    if !path.exists() {
        return;
    }

    match state.recycle_bin.recycle(path, "upgrade").await {
        Ok(recycled) => {
            let _ = state
                .store
                .add_to_recycle_bin(
                    old_path,
                    recycled.recycled_path.to_str(),
                    anime_id,
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

async fn check_finished_anime_seadex(state: &SharedState, anime: &Anime) -> Result<bool> {
    let config = state.config.read().await;
    if !config.downloads.use_seadex {
        return Ok(false);
    }
    drop(config);

    let releases = state.get_seadex_releases_cached(anime.id).await;
    if releases.is_empty() {
        return Ok(false);
    }

    for release in releases.iter().take(3) {
        match try_queue_seadex_release(state, anime, release).await? {
            SeadexQueueResult::Queued => return Ok(true),
            SeadexQueueResult::AlreadyDownloaded => return Ok(true),
            SeadexQueueResult::Skipped => continue,
        }
    }

    Ok(false)
}

/// Result of attempting to queue a SeaDex release.
enum SeadexQueueResult {
    /// Successfully queued the release
    Queued,
    /// Release was already downloaded
    AlreadyDownloaded,
    /// Release was skipped (invalid hash, blocked, etc.)
    Skipped,
}

/// Try to queue a single SeaDex release for download.
async fn try_queue_seadex_release(
    state: &SharedState,
    anime: &Anime,
    release: &crate::clients::seadex::SeaDexRelease,
) -> Result<SeadexQueueResult> {
    let Some(hash) = &release.info_hash else {
        return Ok(SeadexQueueResult::Skipped);
    };

    // Validate hash format (should be 40 hex characters)
    if hash.len() != 40 {
        return Ok(SeadexQueueResult::Skipped);
    }

    // Check if blocked
    if state.store.is_blocked(hash).await.unwrap_or(false) {
        return Ok(SeadexQueueResult::Skipped);
    }

    // Check if already downloaded
    if state.store.get_download_by_hash(hash).await?.is_some() {
        return Ok(SeadexQueueResult::AlreadyDownloaded);
    }

    // Queue the download
    let Some(qbit) = &state.qbit else {
        info!(
            "Would download Seadex Batch (qBit not available): {} [{}]",
            anime.title.romaji, release.release_group
        );
        return Ok(SeadexQueueResult::Queued);
    };

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

            Ok(SeadexQueueResult::Queued)
        }
        Err(e) => {
            warn!("Failed to queue Seadex batch: {}", e);
            Ok(SeadexQueueResult::Skipped)
        }
    }
}
