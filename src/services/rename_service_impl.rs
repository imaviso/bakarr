//! `SeaORM` implementation of the `RenameService` trait.

use crate::config::Config;
use crate::db::Store;
use crate::domain::{AnimeId, EpisodeNumber};
use crate::library::{LibraryService as PathFormatter, RenamingOptions};
use crate::models::episode::EpisodeStatusRow;
use crate::services::episodes::EpisodeService as OldEpisodeService;
use crate::services::rename_service::{RenameError, RenamePreviewItem, RenameResult, RenameService};
use crate::services::MediaService;
use async_trait::async_trait;
use futures::stream::{self, StreamExt};
use std::path::Path as StdPath;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Maximum number of concurrent file analyses during rename preview
const RENAME_PREVIEW_CONCURRENCY: usize = 8;

pub struct SeaOrmRenameService {
    store: Store,
    config: Arc<RwLock<Config>>,
    episodes_service: Arc<OldEpisodeService>,
    event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
}

impl SeaOrmRenameService {
    #[must_use]
    pub fn new(
        store: Store,
        config: Arc<RwLock<Config>>,
        episodes_service: Arc<OldEpisodeService>,
        event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
    ) -> Self {
        Self {
            store,
            config,
            episodes_service,
            event_bus,
        }
    }

    async fn build_renaming_options_with_backfill(
        &self,
        anime_id: AnimeId,
        anime: &crate::models::anime::Anime,
        status: &EpisodeStatusRow,
        current_path: &StdPath,
    ) -> RenamingOptions {
        let ep_num = status.episode_number;
        let title = self
            .episodes_service
            .get_episode_title(anime_id.value(), ep_num)
            .await
            .unwrap_or_else(|_| format!("Episode {ep_num}"));

        let extension = current_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mkv")
            .to_string();

        // Check if media info is already cached in DB
        let has_cached_media_info = status.resolution_width.is_some()
            && status.resolution_height.is_some()
            && status.video_codec.is_some();

        let media_info = if has_cached_media_info {
            // Use cached media info from DB
            Self::build_media_info_from_status(status)
        } else {
            // Analyze file and backfill to DB, fallback to status if analysis fails
            self.analyze_and_backfill_media_info(anime_id, status, current_path)
                .await
                .or_else(|| Self::build_media_info_from_status(status))
        };

        RenamingOptions {
            anime: anime.clone(),
            episode_number: ep_num,
            season: Some(status.season),
            episode_title: title,
            quality: status
                .quality_id
                .and_then(crate::quality::definition::get_quality_by_id)
                .map(|q| q.name),
            group: current_path
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(crate::parser::filename::parse_filename)
                .and_then(|r| r.group),
            original_filename: current_path
                .file_name()
                .and_then(|n| n.to_str())
                .map(std::string::ToString::to_string),
            extension,
            year: anime.start_year,
            media_info,
        }
    }

    /// Builds media info from database status (handles partial data).
    fn build_media_info_from_status(
        status: &EpisodeStatusRow,
    ) -> Option<crate::models::media::MediaInfo> {
        // Only return Some if we have at least resolution data
        let width = status.resolution_width?;
        let height = status.resolution_height?;

        Some(crate::models::media::MediaInfo {
            resolution_width: i64::from(width),
            resolution_height: i64::from(height),
            video_codec: status.video_codec.clone().unwrap_or_default(),
            audio_codecs: status
                .audio_codecs
                .as_ref()
                .and_then(|ac| serde_json::from_str(ac).ok())
                .unwrap_or_default(),
            duration_secs: status.duration_secs.map(f64::from).unwrap_or_default(),
        })
    }

    /// Analyzes the media file and backfills the info to the database.
    /// Returns the media info if analysis succeeds.
    async fn analyze_and_backfill_media_info(
        &self,
        anime_id: AnimeId,
        status: &EpisodeStatusRow,
        current_path: &StdPath,
    ) -> Option<crate::models::media::MediaInfo> {
        let ep_num = status.episode_number;

        let media_service = MediaService::new();
        let media_info = match media_service.get_media_info(current_path).await {
            Ok(info) => info,
            Err(e) => {
                tracing::warn!(
                    anime_id = %anime_id,
                    episode = ep_num,
                    path = ?current_path,
                    error = %e,
                    "Failed to analyze media for backfill"
                );
                return None;
            }
        };

        // Backfill to database (lazy caching)
        if let Err(e) = self
            .store
            .update_episode_media_info(anime_id.value(), ep_num, &media_info)
            .await
        {
            tracing::warn!(
                anime_id = %anime_id,
                episode = ep_num,
                error = %e,
                "Failed to backfill media info to database"
            );
            // Still return the media info even if DB update fails
        } else {
            tracing::debug!(
                anime_id = %anime_id,
                episode = ep_num,
                "Successfully backfilled media info to database"
            );
        }

        Some(media_info)
    }

    async fn update_db_after_rename(
        &self,
        anime_id: AnimeId,
        episode_number: i32,
        old_path: &StdPath,
        new_path: &StdPath,
    ) -> Result<(), RenameError> {
        if let Err(e) = self
            .store
            .update_episode_path(
                anime_id.value(),
                episode_number,
                new_path.to_str().unwrap_or_default(),
            )
            .await
        {
            tracing::error!(
                episode = episode_number,
                error = %e,
                "DB update failed, attempting rollback"
            );

            if let Err(rollback_err) = tokio::fs::rename(new_path, old_path).await {
                tracing::error!(
                    episode = episode_number,
                    error = %rollback_err,
                    new_path = ?new_path,
                    old_path = ?old_path,
                    "CRITICAL: Rollback failed! File renamed but DB not updated"
                );
                return Err(RenameError::Critical(format!(
                    "Ep {episode_number}: CRITICAL ERROR - File renamed but DB not updated and rollback failed!"
                )));
            }

            tracing::info!(
                episode = episode_number,
                path = ?old_path,
                "Rollback successful"
            );
            return Err(RenameError::FileSystem(format!(
                "Ep {episode_number}: Rename failed (DB error, rolled back): {e}"
            )));
        }
        Ok(())
    }
}

#[async_trait]
impl RenameService for SeaOrmRenameService {
    async fn get_preview(&self, anime_id: AnimeId) -> Result<Vec<RenamePreviewItem>, RenameError> {
        let anime = self
            .store
            .get_anime(anime_id.value())
            .await?
            .ok_or(RenameError::AnimeNotFound(anime_id))?;

        let downloaded_eps = self.store.get_episode_statuses(anime_id.value()).await?;

        let episodes_with_files: Vec<_> = downloaded_eps
            .into_iter()
            .filter(|status| status.file_path.is_some())
            .collect();

        if episodes_with_files.is_empty() {
            return Ok(Vec::new());
        }

        let config_guard = self.config.read().await;
        let path_formatter = PathFormatter::new(config_guard.library.clone());
        drop(config_guard);

        // Process episodes concurrently
        let anime_ref = &anime;
        let path_formatter_ref = &path_formatter;
        let self_ref = &self;

        let preview_items = stream::iter(episodes_with_files)
            .map(|status| async move {
                let ep_num = status.episode_number;
                let current_path_str = status.file_path.as_ref()?;
                let current_path = StdPath::new(current_path_str);

                if !current_path.exists() {
                    return None;
                }

                let options = self_ref
                    .build_renaming_options_with_backfill(anime_id, anime_ref, &status, current_path)
                    .await;

                let new_path = path_formatter_ref.get_destination_path(&options);
                let new_path_str = new_path.to_string_lossy().to_string();

                if current_path_str == &new_path_str {
                    return None;
                }

                Some(RenamePreviewItem {
                    episode_number: EpisodeNumber::from(ep_num),
                    current_path: current_path_str.clone(),
                    new_path: new_path_str,
                    new_filename: new_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                })
            })
            .buffer_unordered(RENAME_PREVIEW_CONCURRENCY)
            .filter_map(|x| async move { x })
            .collect::<Vec<_>>()
            .await;

        let mut preview_items = preview_items;
        preview_items.sort_by(|a, b| a.episode_number.value().total_cmp(&b.episode_number.value()));

        Ok(preview_items)
    }

    async fn execute_rename(&self, anime_id: AnimeId) -> Result<RenameResult, RenameError> {
        let anime = self
            .store
            .get_anime(anime_id.value())
            .await?
            .ok_or(RenameError::AnimeNotFound(anime_id))?;

        let _ = self
            .event_bus
            .send(crate::api::NotificationEvent::RenameStarted {
                anime_id: anime_id.value(),
                title: anime.title.romaji.clone(),
            });

        let downloaded_eps = self.store.get_episode_statuses(anime_id.value()).await?;
        let episodes_with_files: Vec<_> = downloaded_eps
            .into_iter()
            .filter(|status| status.file_path.is_some())
            .collect();

        if episodes_with_files.is_empty() {
            return Ok(RenameResult::default());
        }

        let config_guard = self.config.read().await;
        let path_formatter = PathFormatter::new(config_guard.library.clone());
        drop(config_guard);

        let mut renamed_count = 0;
        let mut failed_count = 0;
        let mut failures = Vec::new();

        for status in episodes_with_files {
            let ep_num = status.episode_number;
            let Some(current_path_str) = status.file_path.as_ref() else {
                continue;
            };
            let current_path = StdPath::new(current_path_str);

            if !current_path.exists() {
                continue;
            }

            let options = self
                .build_renaming_options_with_backfill(anime_id, &anime, &status, current_path)
                .await;

            let new_path = path_formatter.get_destination_path(&options);

            if current_path == new_path {
                continue;
            }

            if let Some(parent) = new_path.parent()
                && let Err(e) = tokio::fs::create_dir_all(parent).await
            {
                failed_count += 1;
                failures.push(format!("Ep {ep_num}: Failed to create dir: {e}"));
                continue;
            }

            match tokio::fs::rename(current_path, &new_path).await {
                Ok(()) => {
                    renamed_count += 1;
                    if let Err(e) =
                        self.update_db_after_rename(anime_id, ep_num, current_path, &new_path).await
                    {
                        failures.push(e.to_string());
                    }
                }
                Err(e) => {
                    failed_count += 1;
                    failures.push(format!("Ep {ep_num}: Rename failed: {e}"));
                }
            }
        }

        let _ = self
            .event_bus
            .send(crate::api::NotificationEvent::RenameFinished {
                anime_id: anime_id.value(),
                title: anime.title.romaji,
                count: renamed_count,
            });

        Ok(RenameResult {
            renamed: renamed_count,
            failed: failed_count,
            failures,
        })
    }
}
