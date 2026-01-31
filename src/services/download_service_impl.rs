//! `SeaORM` implementation of the `DownloadService` trait.
//!
//! This module provides the concrete implementation of [`DownloadService`] using
//! `SeaORM` for database access with optimized query patterns.

use crate::api::types::{DownloadDto, QueueItemDto};
use crate::clients::qbittorrent::{QBitClient, QBitConfig, TorrentState};
use crate::config::Config;
use crate::db::Store;
use crate::domain::AnimeId;
use crate::entities::{monitored_anime, release_history};
use crate::services::download_service::{DownloadError, DownloadService};
use sea_orm::{EntityTrait, QueryOrder, QuerySelect};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

// Type alias for download history rows with optional anime
pub type DownloadHistoryRow = (release_history::Model, Option<monitored_anime::Model>);

use crate::services::search::SearchService;

/// SeaORM-based implementation of [`DownloadService`].
pub struct SeaOrmDownloadService {
    store: Store,
    config: Arc<RwLock<Config>>,
    search_service: Arc<SearchService>,
    event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
}

impl SeaOrmDownloadService {
    /// Creates a new instance of the service.
    #[must_use]
    pub const fn new(
        store: Store,
        config: Arc<RwLock<Config>>,
        search_service: Arc<SearchService>,
        event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
    ) -> Self {
        Self {
            store,
            config,
            search_service,
            event_bus,
        }
    }

    /// Creates a qBittorrent client from current config.
    async fn create_qbit_client(&self) -> Result<Option<QBitClient>, DownloadError> {
        let config = self.config.read().await;
        if !config.qbittorrent.enabled {
            return Ok(None);
        }
        let qbit_config = QBitConfig {
            base_url: config.qbittorrent.url.clone(),
            username: config.qbittorrent.username.clone(),
            password: config.qbittorrent.password.clone(),
        };
        drop(config);
        QBitClient::new(qbit_config).map(Some).map_err(|e| {
            DownloadError::Internal(format!("Failed to create qBittorrent client: {e}"))
        })
    }
}

#[async_trait::async_trait]
impl DownloadService for SeaOrmDownloadService {
    async fn get_history(&self, limit: usize) -> Result<Vec<DownloadDto>, DownloadError> {
        // Eager load: Fetch release_history with monitored_anime in one query
        // This eliminates the N+1 query problem from the original implementation
        let limit_u64 = u64::try_from(limit).unwrap_or(u64::MAX);
        let rows = release_history::Entity::find()
            .find_also_related(monitored_anime::Entity)
            .order_by_desc(release_history::Column::DownloadDate)
            .limit(limit_u64)
            .all(&self.store.conn)
            .await
            .map_err(DownloadError::Database)?;

        let mut dtos = Vec::with_capacity(rows.len());

        // Explicit type annotation for clarity
        let rows: Vec<DownloadHistoryRow> = rows;

        for (history, anime_opt) in rows {
            let anime_title: String = anime_opt.as_ref().map_or_else(
                || format!("Anime #{})", history.anime_id),
                |a| a.romaji_title.clone(),
            );

            let download_date = history.download_date.unwrap_or_default().replace(' ', "T");

            dtos.push(DownloadDto {
                id: i64::from(history.id),
                anime_id: history.anime_id,
                anime_title,
                torrent_name: history.filename,
                episode_number: f64::from(history.episode_number),
                group_name: history.group_name,
                download_date,
            });
        }

        Ok(dtos)
    }

    async fn get_queue(&self) -> Result<Vec<QueueItemDto>, DownloadError> {
        let Some(qbit) = self.create_qbit_client().await? else {
            return Ok(Vec::new());
        };

        // Fetch active torrents from qBittorrent
        let torrents = qbit
            .get_torrents(None, None)
            .await
            .map_err(|e| DownloadError::QBit(e.to_string()))?;

        // Filter for active/downloading states
        let active_torrents: Vec<_> = torrents
            .into_iter()
            .filter(|t| {
                matches!(
                    t.state,
                    TorrentState::Downloading
                        | TorrentState::StalledDL
                        | TorrentState::MetaDL
                        | TorrentState::QueuedDL
                        | TorrentState::CheckingDL
                        | TorrentState::Allocating
                        | TorrentState::ForcedDL
                )
            })
            .collect();

        if active_torrents.is_empty() {
            return Ok(Vec::new());
        }

        // Step 1: Collect all info_hashes from active torrents
        let hashes: Vec<String> = active_torrents.iter().map(|t| t.hash.clone()).collect();

        // Step 2: Fetch all matching release_history entries in a single query
        let downloads = self
            .store
            .get_downloads_by_hashes(&hashes)
            .await
            .map_err(|e| DownloadError::Internal(e.to_string()))?;

        // Build a hash map for quick lookup: hash -> (id, anime_id, episode_number)
        let mut download_map: HashMap<String, (i64, i32, f32)> = HashMap::new();
        for entry in downloads {
            if let Some(ref hash) = entry.info_hash {
                download_map.insert(
                    hash.clone(),
                    (entry.id, entry.anime_id, entry.episode_number),
                );
            }
        }

        // Step 3: Collect all unique anime_ids from these entries
        let anime_ids: Vec<i32> = download_map
            .values()
            .map(|(_, id, _)| *id)
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        // Step 4: Fetch all matching monitored_anime entries in a single query
        let anime_list = self
            .store
            .get_animes_by_ids(&anime_ids)
            .await
            .map_err(|e| DownloadError::Internal(e.to_string()))?;

        // Build a hash map for quick lookup: anime_id -> title
        let mut anime_titles: HashMap<i32, String> = HashMap::new();
        for anime in anime_list {
            anime_titles.insert(anime.id, anime.title.romaji);
        }

        // Step 5: Map the results in memory to build the QueueItemDto list
        let mut results = Vec::with_capacity(active_torrents.len());

        for torrent in active_torrents {
            let (id, anime_id, anime_title, episode_number) =
                if let Some((dl_id, aid, ep_num)) = download_map.get(&torrent.hash) {
                    let title = anime_titles
                        .get(aid)
                        .cloned()
                        .unwrap_or_else(|| format!("Anime #{aid}"));
                    (*dl_id, *aid, title, f64::from(*ep_num))
                } else {
                    (0, 0, "Unknown (Manual)".to_string(), 0.0)
                };

            let added_at = chrono::DateTime::from_timestamp(torrent.added_on, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default();

            results.push(QueueItemDto {
                id,
                anime_id,
                anime_title,
                episode_number,
                torrent_name: torrent.name,
                status: torrent.state.to_string(),
                progress: torrent.progress * 100.0,
                added_at,
                hash: torrent.hash,
                size: torrent.size,
                downloaded: torrent.downloaded,
                dlspeed: torrent.dlspeed,
                eta: torrent.eta,
            });
        }

        Ok(results)
    }

    async fn search_missing(&self, anime_id: Option<AnimeId>) -> Result<(), DownloadError> {
        if let Some(id) = anime_id {
            // Validate anime exists
            let anime = self
                .store
                .get_anime(id.value())
                .await
                .map_err(|e| DownloadError::Internal(e.to_string()))?
                .ok_or(DownloadError::AnimeNotFound(id))?;

            let category = crate::clients::qbittorrent::sanitize_category(&anime.title.romaji);

            // Send notification
            let _ = self
                .event_bus
                .send(crate::api::NotificationEvent::SearchMissingStarted {
                    anime_id: id.value(),
                    title: anime.title.romaji.clone(),
                });

            // Clone necessary data for background task
            let store = self.store.clone();
            let config = self.config.clone();
            let search_service = self.search_service.clone();
            let event_bus = self.event_bus.clone();
            let anime_id_val = id.value();
            let anime_title = anime.title.romaji;

            // Spawn background search
            tokio::spawn(async move {
                match perform_search_and_download(
                    search_service,
                    store,
                    config,
                    event_bus.clone(),
                    anime_id_val,
                    &category,
                    &anime_title,
                )
                .await
                {
                    Ok(count) => {
                        let _ =
                            event_bus.send(crate::api::NotificationEvent::SearchMissingFinished {
                                anime_id: anime_id_val,
                                title: anime_title,
                                count: i32::try_from(count).unwrap_or(i32::MAX),
                            });
                    }
                    Err(e) => {
                        let _ = event_bus.send(crate::api::NotificationEvent::Error {
                            message: format!("Search failed: {e}"),
                        });
                    }
                }
            });
        } else {
            // Global search
            let store = self.store.clone();
            let config = self.config.clone();
            let event_bus = self.event_bus.clone();

            let search_service = self.search_service.clone();
            tokio::spawn(async move {
                perform_global_search(search_service, store, config, event_bus).await;
            });
        }

        Ok(())
    }
}

/// Performs search and download for a single anime.
///
/// This function coordinates with `SearchService` to find missing episodes
/// and queue them for download via qBittorrent.
async fn perform_search_and_download(
    search_service: Arc<SearchService>,
    store: Store,
    config: Arc<RwLock<Config>>,
    event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
    anime_id: i32,
    category: &str,
    anime_title: &str,
) -> anyhow::Result<usize> {
    debug!(
        anime_id,
        category, anime_title, "Performing search and download"
    );

    let _ = event_bus.send(crate::api::NotificationEvent::Info {
        message: format!("Search started for {anime_title}"),
    });

    // Create qBit client if enabled
    let qbit = {
        let config = config.read().await;
        if config.qbittorrent.enabled {
            Some(QBitClient::new(QBitConfig {
                base_url: config.qbittorrent.url.clone(),
                username: config.qbittorrent.username.clone(),
                password: config.qbittorrent.password.clone(),
            })?)
        } else {
            None
        }
    };

    // Perform search for the anime
    let results = search_service.search_anime(anime_id).await?;
    let mut count = 0;

    for result in results {
        if result.download_action.should_download() {
            if let Some(qbit) = &qbit {
                if let Err(e) = qbit.create_category(category, None).await {
                    debug!(category, error = %e, "Failed to create category (may already exist)");
                }

                if let Err(e) = qbit.add_magnet(&result.link, None, Some(category)).await {
                    error!(
                        anime_id,
                        error = %e,
                        link = %result.link,
                        "Failed to add torrent"
                    );
                    continue;
                }

                // Record the download
                store
                    .record_download(
                        anime_id,
                        &result.title,
                        result.episode_number,
                        result.group.as_deref(),
                        Some(&result.info_hash),
                    )
                    .await?;

                count += 1;
            } else {
                warn!(
                    "qBittorrent not configured, skipping download: {}",
                    result.title
                );
            }
        }
    }

    Ok(count)
}

/// Performs global search for all monitored anime with missing episodes.
async fn perform_global_search(
    search_service: Arc<SearchService>,
    store: Store,
    config: Arc<RwLock<Config>>,
    event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
) {
    let start = std::time::Instant::now();
    info!(
        event = "global_search_started",
        "Starting global missing episode search"
    );

    let _ = event_bus.send(crate::api::NotificationEvent::Info {
        message: "Starting global search for missing episodes".to_string(),
    });

    // Fetch missing episodes (limited to prevent overwhelming the system)
    let missing_episodes = match store.get_all_missing_episodes(1000).await {
        Ok(eps) => eps,
        Err(e) => {
            error!(event = "global_search_failed", error = %e, "Failed to fetch missing episodes");
            return;
        }
    };

    if missing_episodes.is_empty() {
        info!(
            event = "global_search_finished",
            episodes_found = 0,
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "No missing episodes found"
        );
        return;
    }

    // Get unique anime IDs
    let unique_anime_ids: std::collections::HashSet<i32> = missing_episodes
        .iter()
        .filter_map(|ep| i32::try_from(ep.anime_id).ok())
        .collect();

    debug!(
        episodes_found = missing_episodes.len(),
        series_count = unique_anime_ids.len(),
        "Found missing episodes"
    );

    let mut total_added = 0;

    for (idx, anime_id) in unique_anime_ids.iter().enumerate() {
        if idx > 0 {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }

        let anime_title = match store.get_anime(*anime_id).await {
            Ok(Some(a)) => a.title.romaji,
            _ => format!("Anime #{anime_id}"),
        };

        debug!(
            anime_id = anime_id,
            anime_title = %anime_title,
            progress = format!("{}/{}", idx + 1, unique_anime_ids.len()),
            "Searching missing episodes for series"
        );

        let category = crate::clients::qbittorrent::sanitize_category(&anime_title);

        match perform_search_and_download(
            search_service.clone(),
            store.clone(),
            config.clone(),
            event_bus.clone(),
            *anime_id,
            &category,
            &anime_title,
        )
        .await
        {
            Ok(count) => {
                total_added += i32::try_from(count).unwrap_or(i32::MAX);
                debug!(anime_title = %anime_title, count = count, "Added torrents");
            }
            Err(e) => {
                error!(anime_id = anime_id, error = %e, "Failed to search for anime");
            }
        }
    }

    info!(
        event = "global_search_finished",
        episodes_found = missing_episodes.len(),
        series_processed = unique_anime_ids.len(),
        torrents_added = total_added,
        duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
        "Global search complete"
    );

    let _ = event_bus.send(crate::api::NotificationEvent::Info {
        message: format!("Global search complete. Added {total_added} torrents."),
    });
}
