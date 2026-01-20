use axum::{
    Json,
    extract::{Path, State},
};
use std::sync::Arc;

use super::{
    ApiError, ApiResponse, AppState, BulkMapEpisodeRequest, EpisodeDto, MapEpisodeRequest,
    VideoFileDto,
};
use crate::api::validation::{validate_anime_id, validate_episode_number};
use crate::clients::anilist::AnilistClient;
use crate::services::episodes::EpisodeService;
use crate::services::image::ImageType;

pub async fn list_episodes(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<EpisodeDto>>>, ApiError> {
    validate_anime_id(id)?;
    let anime = state
        .store()
        .get_anime(id)
        .await?
        .ok_or_else(|| ApiError::anime_not_found(id))?;

    let episode_count = anime.episode_count.unwrap_or(1);
    let episode_service = EpisodeService::new(state.store().clone());

    let downloaded_eps = state.store().get_episode_statuses(id).await?;

    let max_downloaded = downloaded_eps
        .iter()
        .map(|e| e.episode_number)
        .max()
        .unwrap_or(0);
    let total_eps = std::cmp::max(episode_count, max_downloaded);

    let start_ep = if downloaded_eps.iter().any(|e| e.episode_number == 0) {
        0
    } else {
        match state.store().get_episode_metadata(id, 0).await {
            Ok(Some(_)) => 0,
            _ => 1,
        }
    };

    let mut episodes = Vec::new();
    for ep_num in start_ep..=total_eps {
        let ep_num_i32 = ep_num;

        let metadata = episode_service
            .get_episode_metadata(id, ep_num_i32)
            .await
            .ok()
            .flatten();

        let status = downloaded_eps
            .iter()
            .find(|s| s.episode_number == ep_num_i32);

        episodes.push(EpisodeDto {
            number: ep_num_i32,
            title: metadata.as_ref().and_then(|m| m.title.clone()),
            aired: metadata.as_ref().and_then(|m| m.aired.clone()),
            downloaded: status.is_some() && status.unwrap().file_path.is_some(),
            file_path: status.and_then(|s| s.file_path.clone()),
        });
    }

    Ok(Json(ApiResponse::success(episodes)))
}

pub async fn missing_episodes(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<i32>>>, ApiError> {
    validate_anime_id(id)?;
    let anime = state
        .store()
        .get_anime(id)
        .await?
        .ok_or_else(|| ApiError::anime_not_found(id))?;

    let episode_count = anime.episode_count.unwrap_or(1);
    let missing = state
        .store()
        .get_missing_episodes(id, episode_count)
        .await?;

    Ok(Json(ApiResponse::success(missing)))
}

pub async fn get_episode(
    State(state): State<Arc<AppState>>,
    Path((id, number)): Path<(i32, i32)>,
) -> Result<Json<ApiResponse<EpisodeDto>>, ApiError> {
    validate_anime_id(id)?;
    validate_episode_number(number)?;

    let _anime = state
        .store()
        .get_anime(id)
        .await?
        .ok_or_else(|| ApiError::anime_not_found(id))?;

    let episode_service = EpisodeService::new(state.store().clone());

    let metadata = episode_service
        .get_episode_metadata(id, number)
        .await
        .ok()
        .flatten();

    let status = state
        .store()
        .get_episode_statuses(id)
        .await?
        .into_iter()
        .find(|s| s.episode_number == number);

    let dto = EpisodeDto {
        number,
        title: metadata.as_ref().and_then(|m| m.title.clone()),
        aired: metadata.as_ref().and_then(|m| m.aired.clone()),
        downloaded: status.is_some() && status.as_ref().unwrap().file_path.is_some(),
        file_path: status.and_then(|s| s.file_path),
    };

    Ok(Json(ApiResponse::success(dto)))
}

pub async fn refresh_metadata(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<usize>>, ApiError> {
    validate_anime_id(id)?;

    let initial_title = if let Some(a) = state.store().get_anime(id).await? {
        a.title.romaji
    } else {
        format!("Anime #{}", id)
    };

    let _ = state
        .event_bus()
        .send(crate::api::NotificationEvent::RefreshStarted {
            anime_id: id,
            title: initial_title,
        });

    let client = AnilistClient::new();
    if let Some(mut anime) = client
        .get_by_id(id)
        .await
        .map_err(|e| ApiError::anilist_error(e.to_string()))?
    {
        if let Some(existing) = state.store().get_anime(id).await? {
            anime.quality_profile_id = existing.quality_profile_id;
            anime.path = existing.path;
            anime.monitored = existing.monitored;
        }

        if let Some(url) = &anime.cover_image {
            match state
                .image_service
                .save_image(url, anime.id, ImageType::Cover)
                .await
            {
                Ok(path) => anime.cover_image = Some(path),
                Err(e) => tracing::warn!("Failed to save cover image: {}", e),
            }
        }

        if let Some(url) = &anime.banner_image {
            match state
                .image_service
                .save_image(url, anime.id, ImageType::Banner)
                .await
            {
                Ok(path) => anime.banner_image = Some(path),
                Err(e) => tracing::warn!("Failed to save banner image: {}", e),
            }
        }

        state
            .metadata_service
            .enrich_anime_metadata(&mut anime)
            .await;

        state.store().add_anime(&anime).await?;

        let _ = state
            .event_bus()
            .send(crate::api::NotificationEvent::RefreshFinished {
                anime_id: id,
                title: anime.title.romaji,
            });
    }

    let episode_service = EpisodeService::new(state.store().clone());
    let count = episode_service.refresh_episode_cache(id).await?;

    Ok(Json(ApiResponse::success(count)))
}

pub async fn delete_episode_file(
    State(state): State<Arc<AppState>>,
    Path((id, number)): Path<(i32, i32)>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;
    validate_episode_number(number)?;

    let status = state
        .store()
        .get_episode_status(id, number)
        .await?
        .ok_or_else(|| ApiError::NotFound("Episode not found or not monitored".to_string()))?;

    if let Some(path_str) = status.file_path {
        let path = std::path::Path::new(&path_str);

        if path.exists() {
            let config_guard = state.config().read().await;
            let recycle_path = config_guard.library.recycle_path.clone();
            let cleanup_days = config_guard.library.recycle_cleanup_days;
            drop(config_guard);

            let recycle_bin = crate::library::RecycleBin::new(recycle_path, cleanup_days);

            match recycle_bin.recycle(path, "User triggered delete").await {
                Ok(recycled_file) => {
                    state
                        .store()
                        .add_to_recycle_bin(
                            &path_str,
                            Some(recycled_file.recycled_path.to_str().unwrap_or_default()),
                            id,
                            number,
                            status.quality_id,
                            status.file_size,
                            "User triggered delete",
                        )
                        .await?;
                }
                Err(e) => {
                    tracing::error!("Failed to recycle file: {}", e);

                    if let Err(e) = tokio::fs::remove_file(path).await {
                        return Err(ApiError::internal(format!("Failed to delete file: {}", e)));
                    }
                }
            }
        }

        state.store().clear_episode_download(id, number).await?;
    } else {
        return Err(ApiError::NotFound(
            "No file associated with this episode".to_string(),
        ));
    }

    Ok(Json(ApiResponse::success(())))
}

pub async fn scan_folder(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<ScanFolderResult>>, ApiError> {
    use std::path::Path as StdPath;

    validate_anime_id(id)?;

    let anime = state
        .store()
        .get_anime(id)
        .await?
        .ok_or_else(|| ApiError::anime_not_found(id))?;

    let folder_path = anime
        .path
        .ok_or_else(|| ApiError::validation("Anime has no root folder set"))?;

    let path = StdPath::new(&folder_path);
    if !path.exists() {
        return Err(ApiError::validation(format!(
            "Folder does not exist: {}",
            folder_path
        )));
    }

    tracing::info!("Scanning folder for anime {}: {:?}", id, path);

    tracing::info!("Scanning folder for anime {}: {:?}", id, path);

    let before_count = state.store().get_downloaded_count(id).await.unwrap_or(0);

    if let Err(e) =
        crate::api::library::scan_folder_for_episodes(state.store(), state.event_bus(), id, path)
            .await
    {
        return Err(ApiError::internal(format!("Failed to scan folder: {}", e)));
    }

    let after_count = state.store().get_downloaded_count(id).await.unwrap_or(0);
    let found = (after_count - before_count).max(0);

    tracing::info!(
        "Folder scan complete: found {} new episodes (total: {})",
        found,
        after_count
    );

    Ok(Json(ApiResponse::success(ScanFolderResult {
        found: found as i32,
        total: after_count,
    })))
}

#[derive(serde::Serialize)]
pub struct ScanFolderResult {
    pub found: i32,
    pub total: i32,
}

pub async fn list_files(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<VideoFileDto>>>, ApiError> {
    validate_anime_id(id)?;

    let anime = state
        .store()
        .get_anime(id)
        .await?
        .ok_or_else(|| ApiError::anime_not_found(id))?;

    let folder_path = anime
        .path
        .ok_or_else(|| ApiError::validation("Anime has no root folder set"))?;

    let path = std::path::Path::new(&folder_path);
    if !path.exists() {
        tracing::error!("list_files: Folder does not exist: {}", folder_path);
        return Err(ApiError::validation(format!(
            "Folder does not exist: {}",
            folder_path
        )));
    }

    tracing::info!("list_files: Scanning root {}", folder_path);

    let statuses = state.store().get_episode_statuses(id).await?;
    let mapped_paths: std::collections::HashMap<String, i32> = statuses
        .into_iter()
        .filter_map(|s| s.file_path.map(|p| (p, s.episode_number)))
        .collect();

    let mut files = Vec::new();
    let mut dirs_to_visit = std::collections::VecDeque::new();
    dirs_to_visit.push_back(path.to_path_buf());

    let mut visited = std::collections::HashSet::new();

    const VIDEO_EXTENSIONS: &[&str] = crate::constants::VIDEO_EXTENSIONS;

    while let Some(current_dir) = dirs_to_visit.pop_front() {
        if !visited.insert(current_dir.clone()) {
            continue;
        }

        tracing::debug!("list_files: Visiting {:?}", current_dir);

        let mut entries = match tokio::fs::read_dir(&current_dir).await {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("list_files: Failed to read dir {:?}: {}", current_dir, e);
                continue;
            }
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                if let Some(name) = entry_path.file_name().and_then(|n| n.to_str())
                    && !name.starts_with('.')
                {
                    dirs_to_visit.push_back(entry_path);
                }
            } else if let Some(ext) = entry_path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if VIDEO_EXTENSIONS.contains(&ext_str.as_str()) {
                    let path_str = entry_path.to_string_lossy().to_string();
                    let name = entry_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let size = tokio::fs::metadata(&entry_path)
                        .await
                        .map(|m| m.len() as i64)
                        .unwrap_or(0);

                    let episode_number = mapped_paths.get(&path_str).copied();

                    files.push(VideoFileDto {
                        name,
                        path: path_str,
                        size,
                        episode_number,
                    });
                } else {
                    tracing::trace!(
                        "list_files: Skipping file with ext {:?}: {:?}",
                        ext_str,
                        entry_path
                    );
                }
            }
        }
    }

    let scanned_paths: std::collections::HashSet<String> =
        files.iter().map(|f| f.path.clone()).collect();

    for (path_str, ep_num) in &mapped_paths {
        if !scanned_paths.contains(path_str) {
            let path = std::path::Path::new(path_str);
            if path.exists() {
                tracing::info!(
                    "list_files: Adding missing mapped file from DB: {}",
                    path_str
                );
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let size = tokio::fs::metadata(path)
                    .await
                    .map(|m| m.len() as i64)
                    .unwrap_or(0);

                files.push(VideoFileDto {
                    name,
                    path: path_str.clone(),
                    size,
                    episode_number: Some(*ep_num),
                });
            } else {
                tracing::warn!("list_files: Mapped file missing from disk: {}", path_str);
            }
        }
    }

    tracing::info!("list_files: Found {} files", files.len());

    files.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(Json(ApiResponse::success(files)))
}

pub async fn map_episode_file(
    State(state): State<Arc<AppState>>,
    Path((id, number)): Path<(i32, i32)>,
    Json(request): Json<MapEpisodeRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;
    validate_episode_number(number)?;

    let path = std::path::Path::new(&request.file_path);
    if !path.exists() {
        return Err(ApiError::validation("File does not exist"));
    }

    let file_size = tokio::fs::metadata(path).await.map(|m| m.len() as i64).ok();

    let media_service = crate::services::MediaService::new();
    let media_info = media_service.get_media_info(path).ok();

    let filename = path.file_name().unwrap_or_default().to_string_lossy();
    let quality = crate::quality::parse_quality_from_filename(&filename);

    let existing_status = state.store().get_episode_status(id, number).await?;
    let season = existing_status.map(|s| s.season).unwrap_or(1);

    state
        .store()
        .mark_episode_downloaded(
            id,
            number,
            season,
            quality.id,
            false,
            &request.file_path,
            file_size,
            media_info.as_ref(),
        )
        .await?;

    Ok(Json(ApiResponse::success(())))
}

pub async fn bulk_map_episodes(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(request): Json<BulkMapEpisodeRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;

    let media_service = crate::services::MediaService::new();

    for mapping in request.mappings {
        if mapping.episode_number <= 0 {
            continue;
        }

        let path = std::path::Path::new(&mapping.file_path);
        if !path.exists() {
            tracing::warn!(
                "Skipping bulk map for ep {}: file not found {:?}",
                mapping.episode_number,
                path
            );
            continue;
        }

        let file_size = tokio::fs::metadata(path).await.map(|m| m.len() as i64).ok();

        let media_info = media_service.get_media_info(path).ok();

        let filename = path.file_name().unwrap_or_default().to_string_lossy();
        let quality = crate::quality::parse_quality_from_filename(&filename);

        let existing_status = state
            .store()
            .get_episode_status(id, mapping.episode_number)
            .await?;
        let season = existing_status.map(|s| s.season).unwrap_or(1);

        if let Err(e) = state
            .store()
            .mark_episode_downloaded(
                id,
                mapping.episode_number,
                season,
                quality.id,
                false,
                &mapping.file_path,
                file_size,
                media_info.as_ref(),
            )
            .await
        {
            tracing::error!(
                "Failed to map episode {} in bulk op: {}",
                mapping.episode_number,
                e
            );
        }
    }

    Ok(Json(ApiResponse::success(())))
}
