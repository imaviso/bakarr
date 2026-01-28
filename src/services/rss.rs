use crate::clients::nyaa::{NyaaClient, NyaaTorrent};
use crate::clients::qbittorrent::{AddTorrentOptions, QBitClient};
use crate::db::Store;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

pub struct RssService {
    store: Store,
    nyaa: Arc<NyaaClient>,
    qbit: Option<Arc<QBitClient>>,
    event_bus: broadcast::Sender<crate::api::NotificationEvent>,
}

#[derive(Debug, Default)]
pub struct RssCheckStats {
    pub total_feeds: i32,
    pub new_items: i32,
    pub queued: i32,
}

impl RssService {
    #[must_use]
    pub const fn new(
        store: Store,
        nyaa: Arc<NyaaClient>,
        qbit: Option<Arc<QBitClient>>,
        event_bus: broadcast::Sender<crate::api::NotificationEvent>,
    ) -> Self {
        Self {
            store,
            nyaa,
            qbit,
            event_bus,
        }
    }

    pub async fn check_feeds(&self, delay_secs: u64) -> anyhow::Result<RssCheckStats> {
        let start = std::time::Instant::now();
        let feeds = self.store.get_enabled_rss_feeds().await?;
        let monitored = self.store.list_monitored().await?;
        let total_feeds = i32::try_from(feeds.len()).unwrap_or(i32::MAX);
        let mut stats = RssCheckStats {
            total_feeds,
            ..Default::default()
        };

        if let Err(e) = self
            .event_bus
            .send(crate::api::NotificationEvent::RssCheckStarted)
        {
            debug!("Failed to send RssCheckStarted event: {}", e);
        }

        info!("Checking {} RSS feeds...", total_feeds);

        for (i, feed) in feeds.iter().enumerate() {
            let name = feed.name.as_deref().unwrap_or("Unnamed");

            if let Err(e) = self
                .event_bus
                .send(crate::api::NotificationEvent::RssCheckProgress {
                    current: i32::try_from(i + 1).unwrap_or(i32::MAX),
                    total: total_feeds,
                    feed_name: name.to_string(),
                })
            {
                debug!("Failed to send RssCheckProgress event: {}", e);
            }

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

        if let Err(e) = self
            .event_bus
            .send(crate::api::NotificationEvent::RssCheckFinished {
                total_feeds: stats.total_feeds,
                new_items: stats.new_items,
            })
        {
            debug!("Failed to send RssCheckFinished event: {}", e);
        }

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
