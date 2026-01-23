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
        let current_path_str = status.file_path.as_ref().unwrap();
        let current_path = StdPath::new(current_path_str);

        if !current_path.exists() {
            continue;
        }

        let title = episode_service
            .get_episode_title(id, ep_num)
            .await
            .unwrap_or_else(|_| format!("Episode {}", ep_num));

        let extension = current_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mkv")
            .to_string();

        let options = RenamingOptions {
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
                .map(|s| s.to_string()),
            extension,
            year: anime.start_year,
            media_info: {
                if let (Some(w), Some(h), Some(codec), Some(duration)) = (
                    status.resolution_width,
                    status.resolution_height,
                    status.video_codec.clone(),
                    status.duration_secs,
                ) {
                    Some(crate::models::media::MediaInfo {
                        resolution_width: w as i64,
                        resolution_height: h as i64,
                        video_codec: codec,
                        audio_codecs: status
                            .audio_codecs
                            .as_ref()
                            .and_then(|ac| serde_json::from_str(ac).ok())
                            .unwrap_or_default(),
                        duration_secs: duration as f64,
                    })
                } else {
                    // Fallback: Read from file if DB metadata is missing
                    let media_service = crate::services::MediaService::new();
                    media_service.get_media_info(current_path).ok()
                }
            },
        };

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
        let current_path_str = status.file_path.as_ref().unwrap();
        let current_path = StdPath::new(current_path_str);

        if !current_path.exists() {
            continue;
        }

        let title = episode_service
            .get_episode_title(id, ep_num)
            .await
            .unwrap_or_else(|_| format!("Episode {}", ep_num));

        let extension = current_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mkv")
            .to_string();

        let options = RenamingOptions {
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
                .map(|s| s.to_string()),
            extension,
            year: anime.start_year,
            media_info: {
                if let (Some(w), Some(h), Some(codec), Some(duration)) = (
                    status.resolution_width,
                    status.resolution_height,
                    status.video_codec.clone(),
                    status.duration_secs,
                ) {
                    Some(crate::models::media::MediaInfo {
                        resolution_width: w as i64,
                        resolution_height: h as i64,
                        video_codec: codec,
                        audio_codecs: status
                            .audio_codecs
                            .as_ref()
                            .and_then(|ac| serde_json::from_str(ac).ok())
                            .unwrap_or_default(),
                        duration_secs: duration as f64,
                    })
                } else {
                    // Fallback: Read from file if DB metadata is missing
                    let media_service = crate::services::MediaService::new();
                    media_service.get_media_info(current_path).ok()
                }
            },
        };

        let new_path = library_service.get_destination_path(&options);

        if current_path == new_path {
            continue;
        }

        if let Some(parent) = new_path.parent()
            && let Err(e) = tokio::fs::create_dir_all(parent).await
        {
            failed_count += 1;
            failures.push(format!("Ep {}: Failed to create dir: {}", ep_num, e));
            continue;
        }

        match tokio::fs::rename(&current_path, &new_path).await {
            Ok(_) => {
                if let Err(e) = state
                    .store()
                    .update_episode_path(id, ep_num, new_path.to_str().unwrap_or_default())
                    .await
                {
                    tracing::error!(
                        "DB update failed for ep {}: {}. Attempting rollback...",
                        ep_num,
                        e
                    );

                    if let Err(rollback_err) = tokio::fs::rename(&new_path, &current_path).await {
                        tracing::error!(
                            "CRITICAL: Rollback failed for ep {}! File is at {:?} but DB thinks it is at {:?}. Error: {}",
                            ep_num,
                            new_path,
                            current_path,
                            rollback_err
                        );

                        renamed_count += 1;
                        failures.push(format!("Ep {}: CRITICAL ERROR - File renamed but DB not updated and rollback failed!", ep_num));
                    } else {
                        tracing::info!(
                            "Rollback successful for ep {}. File restored to {:?}",
                            ep_num,
                            current_path
                        );
                        failed_count += 1;
                        failures.push(format!(
                            "Ep {}: Rename failed (DB error, rolled back): {}",
                            ep_num, e
                        ));
                    }
                } else {
                    renamed_count += 1;
                }
            }
            Err(e) => {
                failed_count += 1;
                failures.push(format!("Ep {}: Rename failed: {}", ep_num, e));
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
