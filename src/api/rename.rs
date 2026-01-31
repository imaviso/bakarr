use crate::api::validation::validate_anime_id;
use axum::{
    Json,
    extract::{Path, State},
};
use futures::stream::{self, StreamExt};
use serde::Serialize;
use std::path::Path as StdPath;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
use crate::library::{LibraryService, RenamingOptions};
use crate::models::episode::EpisodeStatusRow;

/// Maximum number of concurrent file analyses during rename preview
const RENAME_PREVIEW_CONCURRENCY: usize = 8;

#[derive(Debug, Serialize)]
pub struct RenamePreviewItem {
    pub episode_number: i32,
    pub current_path: String,
    pub new_path: String,
    pub new_filename: String,
}

#[derive(Debug, Serialize)]
pub struct RenameResult {
    pub renamed: i32,
    pub failed: i32,
    pub failures: Vec<String>,
}

pub async fn get_rename_preview(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<RenamePreviewItem>>>, ApiError> {
    validate_anime_id(id)?;

    let anime = state
        .store()
        .get_anime(id)
        .await?
        .ok_or_else(|| ApiError::anime_not_found(id))?;

    let downloaded_eps = state.store().get_episode_statuses(id).await?;

    let episodes_with_files: Vec<_> = downloaded_eps
        .into_iter()
        .filter(|status| status.file_path.is_some())
        .collect();

    if episodes_with_files.is_empty() {
        return Ok(Json(ApiResponse::success(Vec::new())));
    }

    let episode_service = &state.shared.episodes;
    let config_guard = state.config().read().await;
    let library_service = LibraryService::new(config_guard.library.clone());
    drop(config_guard);

    // Process episodes concurrently
    let anime_ref = &anime;
    let library_service_ref = &library_service;
    let state_ref = &state;

    let preview_items = stream::iter(episodes_with_files)
        .map(|status| async move {
            let ep_num = status.episode_number;
            let current_path_str = status.file_path.as_ref()?;
            let current_path = StdPath::new(current_path_str);

            if !current_path.exists() {
                return None;
            }

            let options = build_renaming_options_with_backfill(
                id,
                anime_ref,
                &status,
                current_path,
                episode_service,
                state_ref,
            )
            .await;

            let new_path = library_service_ref.get_destination_path(&options);
            let new_path_str = new_path.to_string_lossy().to_string();

            if current_path_str == &new_path_str {
                return None;
            }

            Some(RenamePreviewItem {
                episode_number: ep_num,
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
    preview_items.sort_by_key(|item| item.episode_number);

    Ok(Json(ApiResponse::success(preview_items)))
}

pub async fn execute_rename(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<RenameResult>>, ApiError> {
    validate_anime_id(id)?;

    let anime = state
        .store()
        .get_anime(id)
        .await?
        .ok_or_else(|| ApiError::anime_not_found(id))?;

    let _ = state
        .event_bus()
        .send(crate::api::NotificationEvent::RenameStarted {
            anime_id: id,
            title: anime.title.romaji.clone(),
        });

    let downloaded_eps = state.store().get_episode_statuses(id).await?;
    let episodes_with_files: Vec<_> = downloaded_eps
        .into_iter()
        .filter(|status| status.file_path.is_some())
        .collect();

    if episodes_with_files.is_empty() {
        return Ok(Json(ApiResponse::success(RenameResult {
            renamed: 0,
            failed: 0,
            failures: Vec::new(),
        })));
    }

    let episode_service = &state.shared.episodes;
    let config_guard = state.config().read().await;
    let library_service = LibraryService::new(config_guard.library.clone());
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

        let options = build_renaming_options_with_backfill(
            id,
            &anime,
            &status,
            current_path,
            episode_service,
            &state,
        )
        .await;

        let new_path = library_service.get_destination_path(&options);

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
                    update_db_after_rename(&state, id, ep_num, current_path, &new_path).await
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

    let _ = state
        .event_bus()
        .send(crate::api::NotificationEvent::RenameFinished {
            anime_id: id,
            title: anime.title.romaji,
            count: renamed_count,
        });

    Ok(Json(ApiResponse::success(RenameResult {
        renamed: renamed_count,
        failed: failed_count,
        failures,
    })))
}

async fn update_db_after_rename(
    state: &AppState,
    anime_id: i32,
    episode_number: i32,
    old_path: &StdPath,
    new_path: &StdPath,
) -> anyhow::Result<()> {
    if let Err(e) = state
        .store()
        .update_episode_path(
            anime_id,
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
            anyhow::bail!(
                "Ep {episode_number}: CRITICAL ERROR - File renamed but DB not updated and rollback failed!"
            );
        }

        tracing::info!(
            episode = episode_number,
            path = ?old_path,
            "Rollback successful"
        );
        anyhow::bail!("Ep {episode_number}: Rename failed (DB error, rolled back): {e}");
    }
    Ok(())
}

async fn build_renaming_options_with_backfill(
    anime_id: i32,
    anime: &crate::models::anime::Anime,
    status: &EpisodeStatusRow,
    current_path: &StdPath,
    episode_service: &crate::services::episodes::EpisodeService,
    state: &AppState,
) -> RenamingOptions {
    let ep_num = status.episode_number;
    let title = episode_service
        .get_episode_title(anime_id, ep_num)
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
        build_media_info_from_status(status)
    } else {
        // Analyze file and backfill to DB, fallback to status if analysis fails
        analyze_and_backfill_media_info(anime_id, status, current_path, state)
            .await
            .or_else(|| build_media_info_from_status(status))
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
    anime_id: i32,
    status: &EpisodeStatusRow,
    current_path: &StdPath,
    state: &AppState,
) -> Option<crate::models::media::MediaInfo> {
    let ep_num = status.episode_number;

    let media_service = crate::services::MediaService::new();
    let media_info = match media_service.get_media_info(current_path).await {
        Ok(info) => info,
        Err(e) => {
            tracing::warn!(
                anime_id = anime_id,
                episode = ep_num,
                path = ?current_path,
                error = %e,
                "Failed to analyze media for backfill"
            );
            return None;
        }
    };

    // Backfill to database (lazy caching)
    if let Err(e) = state
        .store()
        .update_episode_media_info(anime_id, ep_num, &media_info)
        .await
    {
        tracing::warn!(
            anime_id = anime_id,
            episode = ep_num,
            error = %e,
            "Failed to backfill media info to database"
        );
        // Still return the media info even if DB update fails
    } else {
        tracing::debug!(
            anime_id = anime_id,
            episode = ep_num,
            "Successfully backfilled media info to database"
        );
    }

    Some(media_info)
}
