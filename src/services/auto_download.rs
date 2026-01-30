use crate::clients::qbittorrent::{AddTorrentOptions, QBitClient};
use crate::config::Config;
use crate::db::Store;
use crate::library::RecycleBin;
use crate::models::anime::Anime;
use crate::services::SeaDexService;
use crate::services::search::{SearchResult, SearchService};
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

pub struct AutoDownloadService {
    store: Store,
    config: Arc<RwLock<Config>>,
    search_service: Arc<SearchService>,
    seadex_service: Arc<SeaDexService>,
    qbit: Option<Arc<QBitClient>>,
    recycle_bin: RecycleBin,
}

impl AutoDownloadService {
    pub const fn new(
        store: Store,
        config: Arc<RwLock<Config>>,
        search_service: Arc<SearchService>,
        seadex_service: Arc<SeaDexService>,
        qbit: Option<Arc<QBitClient>>,
        recycle_bin: RecycleBin,
    ) -> Self {
        Self {
            store,
            config,
            search_service,
            seadex_service,
            qbit,
            recycle_bin,
        }
    }

    pub async fn check_all_anime(&self, delay_secs: u32) -> Result<()> {
        let start = std::time::Instant::now();
        let monitored = self.store.list_monitored().await?;
        let count = monitored.len();
        info!("Checking {} monitored anime via Nyaa search", count);

        let mut processed = 0;
        let mut errors = 0;

        for anime in monitored {
            if !anime.monitored {
                continue;
            }

            if let Err(e) = self.check_anime_releases(&anime).await {
                warn!(anime = %anime.title.romaji, error = %e, "Error checking anime");
                errors += 1;
            } else {
                processed += 1;
            }

            if delay_secs > 0 {
                tokio::time::sleep(tokio::time::Duration::from_secs(u64::from(delay_secs))).await;
            }
        }

        info!(
            event = "auto_download_check_finished",
            total_monitored = count,
            processed = processed,
            errors = errors,
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "Anime search check complete"
        );
        Ok(())
    }

    async fn check_anime_releases(&self, anime: &Anime) -> Result<()> {
        debug!("Checking: {}", anime.title.romaji);

        if anime.status == "FINISHED"
            && matches!(self.check_finished_anime_seadex(anime).await, Ok(true))
        {
            info!(
                "Found and queued Seadex batch for {}, skipping individual episode search",
                anime.title.romaji
            );
            return Ok(());
        }

        // Get missing episodes for this anime
        let missing_episodes = self.get_missing_episode_numbers(anime.id).await?;
        if missing_episodes.is_empty() {
            debug!("No missing episodes for {}", anime.title.romaji);
            return Ok(());
        }

        let total_missing = missing_episodes.len();
        info!(
            anime = %anime.title.romaji,
            missing_count = total_missing,
            missing_episodes = ?missing_episodes,
            "Checking for missing episodes"
        );

        let results = self.search_service.search_anime(anime.id).await?;

        if results.is_empty() {
            debug!("No matching releases for {}", anime.title.romaji);
            return Ok(());
        }

        // Track which episodes we've found good releases for
        let mut covered_episodes = std::collections::HashSet::new();
        let mut processed_count = 0;

        // Process ALL results but stop early if all episodes are covered
        for result in results {
            // Safety limit: don't process more than 50 results to avoid overwhelming qBit
            processed_count += 1;
            if processed_count > 50 {
                info!(
                    anime = %anime.title.romaji,
                    "Reached safety limit of 50 results, stopping"
                );
                break;
            }

            if self.store.is_downloaded(&result.title).await? {
                debug!("Already downloaded exact file: {}", result.title);
                continue;
            }

            #[allow(clippy::cast_possible_truncation)]
            let episode_num = result.episode_number as i32;

            // Skip if this episode isn't in our missing list
            if !missing_episodes.contains(&episode_num) {
                continue;
            }

            // Skip if we already found a good release for this episode
            if covered_episodes.contains(&episode_num) {
                continue;
            }

            match self.process_search_result(anime, &result).await {
                Ok(true) => {
                    // Successfully queued
                    covered_episodes.insert(episode_num);
                    info!(
                        anime = %anime.title.romaji,
                        episode = episode_num,
                        covered = covered_episodes.len(),
                        total = total_missing,
                        "Found release for episode"
                    );

                    // SMART LIMIT: Stop if all missing episodes are covered
                    if covered_episodes.len() >= total_missing {
                        info!(
                            anime = %anime.title.romaji,
                            total_episodes = total_missing,
                            "All missing episodes now have releases queued, stopping early"
                        );
                        break;
                    }
                }
                Ok(false) => {
                    // Processed but rejected/upgrade not needed
                }
                Err(e) => {
                    warn!(error = %e, "Error processing search result");
                }
            }
        }

        if covered_episodes.len() < total_missing {
            let remaining: Vec<_> = missing_episodes
                .into_iter()
                .filter(|ep| !covered_episodes.contains(ep))
                .collect();
            info!(
                anime = %anime.title.romaji,
                remaining_episodes = ?remaining,
                "Could not find releases for all missing episodes"
            );
        }

        Ok(())
    }

    /// Get list of missing episode numbers for an anime
    /// A episode is missing if: monitored AND `file_path` is None
    async fn get_missing_episode_numbers(&self, anime_id: i32) -> Result<Vec<i32>> {
        let statuses = self.store.get_episode_statuses(anime_id).await?;

        let missing: Vec<i32> = statuses
            .into_iter()
            .filter(|status| status.monitored && status.file_path.is_none())
            .map(|status| status.episode_number)
            .collect();

        Ok(missing)
    }

    /// Process a search result and queue download if accepted
    /// Returns Ok(true) if a download was queued, Ok(false) otherwise
    async fn process_search_result(&self, anime: &Anime, result: &SearchResult) -> Result<bool> {
        #[allow(clippy::cast_possible_truncation)]
        let episode_number = result.episode_number as i32;

        match &result.download_action {
            crate::services::download::DownloadAction::Accept {
                quality, is_seadex, ..
            } => {
                info!(
                    event = "download_decision",
                    decision = "accept",
                    anime_title = %anime.title.romaji,
                    episode = episode_number,
                    quality = %quality,
                    group = %result.group.as_deref().unwrap_or("Unknown"),
                    is_seadex = is_seadex,
                    "New release accepted"
                );

                self.queue_download_from_result(anime, result, quality, *is_seadex)
                    .await?;
                Ok(true)
            }
            crate::services::download::DownloadAction::Upgrade {
                quality,
                is_seadex,
                reason,
                old_file_path,
                old_quality,
                ..
            } => {
                info!(
                    event = "download_decision",
                    decision = "upgrade",
                    anime_title = %anime.title.romaji,
                    episode = episode_number,
                    old_quality = %old_quality,
                    new_quality = %quality,
                    reason = %reason,
                    "Upgrade decision made"
                );

                self.handle_upgrade_recycle(
                    anime.id,
                    episode_number,
                    old_file_path.as_ref(),
                    old_quality,
                )
                .await;

                self.queue_download_from_result(anime, result, quality, *is_seadex)
                    .await?;
                Ok(true)
            }
            crate::services::download::DownloadAction::Reject { reason } => {
                debug!(
                    event = "download_decision",
                    decision = "reject",
                    anime_title = %anime.title.romaji,
                    episode = episode_number,
                    reason = %reason,
                    "Release rejected"
                );
                Ok(false)
            }
        }
    }

    async fn queue_download_from_result(
        &self,
        anime: &Anime,
        result: &SearchResult,
        quality: &crate::quality::Quality,
        is_seadex: bool,
    ) -> Result<()> {
        let Some(qbit) = &self.qbit else {
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
            Ok(()) => {
                info!(
                    event = "download_queued",
                    title = %result.title,
                    quality = %quality,
                    is_seadex = is_seadex,
                    "Torrent queued successfully"
                );

                self.store
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
                warn!(
                    event = "queue_failed",
                    error = %e,
                    title = %result.title,
                    "Failed to queue torrent"
                );
            }
        }

        Ok(())
    }

    async fn handle_upgrade_recycle(
        &self,
        anime_id: i32,
        episode_number: i32,
        old_file_path: Option<&String>,
        old_quality: &crate::quality::Quality,
    ) {
        let Some(old_path) = old_file_path else {
            return;
        };

        let path = std::path::Path::new(old_path);
        if !path.exists() {
            return;
        }

        match self.recycle_bin.recycle(path, "upgrade").await {
            Ok(recycled) => {
                let _ = self
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
                warn!(error = %e, "Failed to recycle old file");
            }
        }
    }

    async fn check_finished_anime_seadex(&self, anime: &Anime) -> Result<bool> {
        let config = self.config.read().await;
        if !config.downloads.use_seadex {
            return Ok(false);
        }
        drop(config);

        let releases = self.seadex_service.get_releases(anime.id).await;
        if releases.is_empty() {
            return Ok(false);
        }

        for release in releases.iter().take(3) {
            match self.try_queue_seadex_release(anime, release).await? {
                SeadexQueueResult::Queued | SeadexQueueResult::AlreadyDownloaded => {
                    return Ok(true);
                }
                SeadexQueueResult::Skipped => {}
            }
        }

        Ok(false)
    }

    async fn try_queue_seadex_release(
        &self,
        anime: &Anime,
        release: &crate::clients::seadex::SeaDexRelease,
    ) -> Result<SeadexQueueResult> {
        let Some(hash_raw) = &release.info_hash else {
            return Ok(SeadexQueueResult::Skipped);
        };
        let hash = hash_raw.to_lowercase();

        if hash.len() != 40 {
            return Ok(SeadexQueueResult::Skipped);
        }

        if self.store.is_blocked(&hash).await.unwrap_or(false) {
            return Ok(SeadexQueueResult::Skipped);
        }

        if self.store.get_download_by_hash(&hash).await?.is_some() {
            return Ok(SeadexQueueResult::AlreadyDownloaded);
        }

        let Some(qbit) = &self.qbit else {
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
            Ok(()) => {
                info!(
                    "✓ Queued Seadex Batch: {} [{}]",
                    anime.title.romaji, release.release_group
                );

                self.store
                    .record_download(
                        anime.id,
                        &format!("{} - {}", anime.title.romaji, release.release_group),
                        -1.0,
                        Some(&release.release_group),
                        Some(&hash),
                    )
                    .await?;

                Ok(SeadexQueueResult::Queued)
            }
            Err(e) => {
                warn!(error = %e, "Failed to queue Seadex batch");
                Ok(SeadexQueueResult::Skipped)
            }
        }
    }
}

enum SeadexQueueResult {
    Queued,
    AlreadyDownloaded,
    Skipped,
}
