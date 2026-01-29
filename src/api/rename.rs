use crate::api::validation::validate_anime_id;
use axum::{
    Json,
    extract::{Path, State},
};
use serde::Serialize;
use std::path::Path as StdPath;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
use crate::library::{LibraryService, RenamingOptions};

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

    let mut preview_items = Vec::new();

    for status in episodes_with_files {
        let ep_num = status.episode_number;
        let Some(current_path_str) = status.file_path.as_ref() else {
            continue;
        };
        let current_path = StdPath::new(current_path_str);

        if !current_path.exists() {
            continue;
        }

        let options =
            build_renaming_options(id, &anime, &status, current_path, episode_service).await;

        let new_path = library_service.get_destination_path(&options);
        let new_path_str = new_path.to_string_lossy().to_string();

        if current_path_str != &new_path_str {
            preview_items.push(RenamePreviewItem {
                episode_number: ep_num,
                current_path: current_path_str.clone(),
                new_path: new_path_str,
                new_filename: new_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
            });
        }
    }

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

        let options =
            build_renaming_options(id, &anime, &status, current_path, episode_service).await;

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

async fn build_renaming_options(
    anime_id: i32,
    anime: &crate::models::anime::Anime,
    status: &crate::models::episode::EpisodeStatusRow,
    current_path: &StdPath,
    episode_service: &crate::services::EpisodeService,
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
        media_info: build_media_info(status, current_path).await,
    }
}

async fn build_media_info(
    status: &crate::models::episode::EpisodeStatusRow,
    current_path: &StdPath,
) -> Option<crate::models::media::MediaInfo> {
    if let (Some(w), Some(h), Some(codec), Some(duration)) = (
        status.resolution_width,
        status.resolution_height,
        status.video_codec.clone(),
        status.duration_secs,
    ) {
        Some(crate::models::media::MediaInfo {
            resolution_width: i64::from(w),
            resolution_height: i64::from(h),
            video_codec: codec,
            audio_codecs: status
                .audio_codecs
                .as_ref()
                .and_then(|ac| serde_json::from_str(ac).ok())
                .unwrap_or_default(),
            duration_secs: f64::from(duration),
        })
    } else {
        let media_service = crate::services::MediaService::new();
        media_service.get_media_info(current_path).await.ok()
    }
}
