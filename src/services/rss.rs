//! Domain service for managing RSS feeds and periodic check tasks.

use crate::clients::nyaa::{NyaaClient, NyaaTorrent};
use crate::clients::qbittorrent::{AddTorrentOptions, QBitClient};
use crate::db::Store;
use crate::domain::AnimeId;
use serde::Serialize;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

/// Errors specific to RSS operations.
#[derive(Debug, Error)]
pub enum RssError {
    #[error("Anime not found: {0}")]
    AnimeNotFound(AnimeId),

    #[error("Feed not found: {0}")]
    NotFound(i64),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<sea_orm::DbErr> for RssError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err.to_string())
    }
}

impl From<anyhow::Error> for RssError {
    fn from(err: anyhow::Error) -> Self {
        Self::Internal(err.to_string())
    }
}

/// DTO for RSS feed information.
#[derive(Debug, Serialize, Clone)]
pub struct RssFeedDto {
    pub id: i64,
    pub anime_id: i32,
    pub url: String,
    pub name: Option<String>,
    pub last_checked: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

impl From<crate::db::RssFeed> for RssFeedDto {
    fn from(feed: crate::db::RssFeed) -> Self {
        Self {
            id: feed.id,
            anime_id: feed.anime_id,
            url: feed.url,
            name: feed.name,
            last_checked: feed.last_checked,
            enabled: feed.enabled,
            created_at: feed.created_at,
        }
    }
}

#[derive(Debug, Default)]
pub struct RssCheckStats {
    pub total_feeds: i32,
    pub new_items: i32,
    pub queued: i32,
}

/// Domain service trait for RSS operations.
#[async_trait::async_trait]
pub trait RssService: Send + Sync {
    /// Lists all configured RSS feeds.
    async fn list_feeds(&self) -> Result<Vec<RssFeedDto>, RssError>;

    /// Gets RSS feeds for a specific anime.
    async fn get_feeds_for_anime(&self, anime_id: AnimeId) -> Result<Vec<RssFeedDto>, RssError>;

    /// Adds a new RSS feed.
    async fn add_feed(
        &self,
        anime_id: AnimeId,
        url: &str,
        name: Option<&str>,
    ) -> Result<RssFeedDto, RssError>;

    /// Deletes an RSS feed.
    async fn delete_feed(&self, id: i64) -> Result<bool, RssError>;

    /// Toggles an RSS feed's enabled status.
    async fn toggle_feed(&self, id: i64, enabled: bool) -> Result<bool, RssError>;

    /// Triggers a check of all enabled RSS feeds.
    async fn check_feeds(&self, delay_secs: u64) -> Result<RssCheckStats, RssError>;

    /// Triggers an RSS check in the background.
    fn trigger_check(&self);
}

pub struct DefaultRssService {
    store: Store,
    nyaa: Arc<NyaaClient>,
    qbit: Option<Arc<QBitClient>>,
    download_decisions: crate::services::download::DownloadDecisionService,
    event_bus: broadcast::Sender<crate::domain::events::NotificationEvent>,
}

impl DefaultRssService {
    #[must_use]
    pub const fn new(
        store: Store,
        nyaa: Arc<NyaaClient>,
        qbit: Option<Arc<QBitClient>>,
        download_decisions: crate::services::download::DownloadDecisionService,
        event_bus: broadcast::Sender<crate::domain::events::NotificationEvent>,
    ) -> Self {
        Self {
            store,
            nyaa,
            qbit,
            download_decisions,
            event_bus,
        }
    }

    #[allow(clippy::too_many_lines)]
    async fn process_new_item(
        &self,
        anime: &crate::models::anime::Anime,
        torrent: &NyaaTorrent,
    ) -> anyhow::Result<bool> {
        use crate::parser::filename::parse_filename;

        if self.store.is_downloaded(&torrent.title).await? {
            debug!("Already downloaded: {}", torrent.title);
            return Ok(false);
        }

        let Some(release) = parse_filename(&torrent.title) else {
            debug!(
                "Could not parse episode number from RSS item: {}",
                torrent.title
            );
            return Ok(false);
        };

        if let Some(season) = release.season
            && let Some(expected) =
                crate::parser::filename::detect_season_from_title(&anime.title.romaji)
            && season != expected
        {
            debug!(
                "Skipping RSS item due to season mismatch: {} (Expected S{}, got S{})",
                torrent.title, expected, season
            );
            return Ok(false);
        }

        let episode_number = release.episode_number;
        let group = release.group;

        info!(
            event = "rss_item_found",
            anime_title = %anime.title.romaji,
            episode = episode_number,
            group = %group.as_deref().unwrap_or("Unknown"),
            "New release found"
        );

        if let Some(qbit) = &self.qbit {
            // Check download decision logic before queueing
            let profile = self
                .download_decisions
                .get_quality_profile_for_anime(anime.id)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to get profile: {e}"))?;

            let rules = self
                .store
                .get_release_rules_for_anime(anime.id)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to get rules: {e}"))?;

            let action = crate::services::download::DownloadDecisionService::decide_download(
                &profile,
                &rules,
                None, // Assuming new download
                &torrent.title,
                false,
                Some(crate::parser::size::parse_size(&torrent.size).unwrap_or(0)),
            );

            if !action.should_download() {
                debug!("Skipping RSS item due to profile rules: {}", torrent.title);
                return Ok(false);
            }

            let category = crate::clients::qbittorrent::sanitize_category(&anime.title.romaji);

            let _ = qbit.create_category(&category, None).await;

            let magnet = torrent.magnet_link();
            let options = AddTorrentOptions {
                category: Some(category.clone()),
                save_path: None,
                ..Default::default()
            };

            match qbit.add_torrent_url(&magnet, Some(options)).await {
                Ok(()) => {
                    info!(
                        event = "rss_download_queued",
                        title = %torrent.title,
                        category = %category,
                        "Torrent queued successfully"
                    );

                    self.store
                        .record_download(
                            anime.id,
                            &torrent.title,
                            episode_number,
                            group.as_deref(),
                            Some(&torrent.info_hash),
                        )
                        .await?;

                    return Ok(true);
                }
                Err(e) => {
                    warn!(
                        event = "rss_queue_failed",
                        error = %e,
                        title = %torrent.title,
                        "Failed to queue torrent"
                    );
                }
            }
        } else {
            info!(
                event = "rss_download_skipped",
                reason = "qbit_not_available",
                title = %torrent.title,
                "Would download (qBit not available)"
            );
        }

        Ok(false)
    }
}

#[async_trait::async_trait]
impl RssService for DefaultRssService {
    async fn list_feeds(&self) -> Result<Vec<RssFeedDto>, RssError> {
        let feeds = self.store.list_rss_feeds().await?;
        Ok(feeds.into_iter().map(RssFeedDto::from).collect())
    }

    async fn get_feeds_for_anime(&self, anime_id: AnimeId) -> Result<Vec<RssFeedDto>, RssError> {
        let feeds = self.store.get_rss_feeds_for_anime(anime_id.value()).await?;
        Ok(feeds.into_iter().map(RssFeedDto::from).collect())
    }

    async fn add_feed(
        &self,
        anime_id: AnimeId,
        url: &str,
        name: Option<&str>,
    ) -> Result<RssFeedDto, RssError> {
        let anime = self.store.get_anime(anime_id.value()).await?;
        if anime.is_none() {
            return Err(RssError::AnimeNotFound(anime_id));
        }

        let feed_id = self.store.add_rss_feed(anime_id.value(), url, name).await?;

        let feed = self.store.get_rss_feed(feed_id).await?;
        feed.map(RssFeedDto::from)
            .ok_or_else(|| RssError::Internal("Failed to retrieve created feed".to_string()))
    }

    async fn delete_feed(&self, id: i64) -> Result<bool, RssError> {
        Ok(self.store.remove_rss_feed(id).await?)
    }

    async fn toggle_feed(&self, id: i64, enabled: bool) -> Result<bool, RssError> {
        Ok(self.store.toggle_rss_feed(id, enabled).await?)
    }

    async fn check_feeds(&self, delay_secs: u64) -> Result<RssCheckStats, RssError> {
        let start = std::time::Instant::now();
        let feeds = self.store.get_enabled_rss_feeds().await?;
        let monitored = self.store.list_monitored().await?;
        let total_feeds = i32::try_from(feeds.len()).unwrap_or(i32::MAX);
        let mut stats = RssCheckStats {
            total_feeds,
            ..Default::default()
        };

        let _ = self
            .event_bus
            .send(crate::domain::events::NotificationEvent::RssCheckStarted);
        info!("Checking {} RSS feeds...", total_feeds);

        for (i, feed) in feeds.iter().enumerate() {
            let name = feed.name.as_deref().unwrap_or("Unnamed");

            let _ =
                self.event_bus
                    .send(crate::domain::events::NotificationEvent::RssCheckProgress {
                        current: i32::try_from(i + 1).unwrap_or(i32::MAX),
                        total: total_feeds,
                        feed_name: name.to_string(),
                    });

            let Some(anime) = monitored.iter().find(|a| a.id == feed.anime_id) else {
                warn!(
                    "RSS feed {} references unknown anime {}",
                    feed.id, feed.anime_id
                );
                continue;
            };

            match self
                .nyaa
                .check_feed_for_new(&feed.url, feed.last_item_hash.as_deref())
                .await
            {
                Ok((new_items, new_hash)) => {
                    let count = i32::try_from(new_items.len()).unwrap_or(i32::MAX);
                    stats.new_items += count;

                    if let Err(e) = self
                        .store
                        .update_rss_feed_checked(feed.id, new_hash.as_deref())
                        .await
                    {
                        warn!("Failed to update RSS feed {}: {}", feed.id, e);
                    }

                    if count > 0 {
                        info!(
                            event = "rss_feed_checked",
                            feed_name = %name,
                            new_items = count,
                            "RSS feed check complete"
                        );

                        for torrent in new_items {
                            if let Ok(queued) = self.process_new_item(anime, &torrent).await
                                && queued
                            {
                                stats.queued += 1;
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Error checking RSS feed '{}': {}", name, e);
                }
            }

            if delay_secs > 0 {
                tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
            }
        }

        let _ = self
            .event_bus
            .send(crate::domain::events::NotificationEvent::RssCheckFinished {
                total_feeds: stats.total_feeds,
                new_items: stats.new_items,
            });

        info!(
            event = "rss_check_finished",
            total_feeds = stats.total_feeds,
            new_items = stats.new_items,
            queued = stats.queued,
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "RSS check cycle completed"
        );

        Ok(stats)
    }

    fn trigger_check(&self) {
        let store = self.store.clone();
        let nyaa = self.nyaa.clone();
        let qbit = self.qbit.clone();
        let download_decisions = self.download_decisions.clone();
        let event_bus = self.event_bus.clone();

        tokio::spawn(async move {
            let service = Self::new(store, nyaa, qbit, download_decisions, event_bus);
            // Default delay from 0 for manual triggers? Or fetch from DB?
            // The original logic used config.
            if let Err(e) = service.check_feeds(0).await {
                tracing::error!("Background RSS check failed: {}", e);
            }
        });
    }
}
