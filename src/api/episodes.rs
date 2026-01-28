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
    let episode_service = &state.shared.episodes;

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

    let metadata_list = state.store().get_episodes_for_anime(id).await?;
    let metadata_map: std::collections::HashMap<_, _> = metadata_list
        .into_iter()
        .map(|m| (m.episode_number, m))
        .collect();

    // Collect episode numbers with stale file_path entries (file doesn't exist on disk)
    let mut stale_episodes: Vec<i32> = Vec::new();

    for ep_num in start_ep..=total_eps {
        let ep_num_i32 = ep_num;

        let metadata = if let Some(meta) = metadata_map.get(&ep_num_i32) {
            Some(meta.clone())
        } else {
            episode_service
                .get_episode_metadata(id, ep_num_i32)
                .await
                .ok()
                .flatten()
        };

        let status = downloaded_eps
            .iter()
            .find(|s| s.episode_number == ep_num_i32);

        // Check if file actually exists on disk
        let (downloaded, file_path) = if let Some(s) = status
            && let Some(ref path_str) = s.file_path
        {
            let path = std::path::Path::new(path_str);
            if path.exists() {
                (true, Some(path_str.clone()))
            } else {
                // File is missing from disk - mark as stale
                tracing::warn!(
                    episode = ep_num_i32,
                    path = %path_str,
                    "File missing from disk"
                );
                stale_episodes.push(ep_num_i32);
                (false, None)
            }
        } else {
            (false, None)
        };

        episodes.push(EpisodeDto {
            number: ep_num_i32,
            title: metadata.as_ref().and_then(|m| m.title.clone()),
            aired: metadata.as_ref().and_then(|m| m.aired.clone()),
            downloaded,
            file_path,
        });
    }

    // Clear stale episode entries in the background
    if !stale_episodes.is_empty() {
        let store = state.store().clone();
        let anime_id = id;
        tokio::spawn(async move {
            for ep_num in stale_episodes {
                if let Err(e) = store.clear_episode_download(anime_id, ep_num).await {
                    tracing::error!(episode = ep_num, error = %e, "Failed to clear stale episode");
                }
            }
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

    let episode_service = &state.shared.episodes;

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

    // Check if file actually exists on disk
    let (downloaded, file_path) = if let Some(ref s) = status
        && let Some(ref path_str) = s.file_path
    {
        let path = std::path::Path::new(path_str);
        if path.exists() {
            (true, Some(path_str.clone()))
        } else {
            // File is missing - clear stale entry in background
            let store = state.store().clone();
            let anime_id = id;
            let ep_num = number;
            tokio::spawn(async move {
                let _ = store.clear_episode_download(anime_id, ep_num).await;
            });
            (false, None)
        }
    } else {
        (false, None)
    };

    let dto = EpisodeDto {
        number,
        title: metadata.as_ref().and_then(|m| m.title.clone()),
        aired: metadata.as_ref().and_then(|m| m.aired.clone()),
        downloaded,
        file_path,
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
        format!("Anime #{id}")
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

        save_anime_images(&state, &mut anime).await;

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

    let episode_service = &state.shared.episodes;
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

    if let Some(ref path_str) = status.file_path {
        let path = std::path::Path::new(&path_str);

        if path.exists() {
            recycle_episode_file(&state, id, number, &status, path).await?;
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
            "Folder does not exist: {folder_path}"
        )));
    }

    tracing::info!(anime_id = id, path = ?path, "Scanning folder");

    let before_count = state.store().get_downloaded_count(id).await.unwrap_or(0);

    if let Err(e) =
        crate::api::library::scan_folder_for_episodes(state.store(), state.event_bus(), id, path)
            .await
    {
        return Err(ApiError::internal(format!("Failed to scan folder: {e}")));
    }

    let after_count = state.store().get_downloaded_count(id).await.unwrap_or(0);
    let found = (after_count - before_count).max(0);

    tracing::info!(
        event = "folder_scan_finished",
        found = found,
        total = after_count,
        "Folder scan complete"
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
        tracing::error!(path = %folder_path, "Folder does not exist");
        return Err(ApiError::validation(format!(
            "Folder does not exist: {folder_path}"
        )));
    }

    tracing::debug!(path = %folder_path, "Scanning root for files");

    let statuses = state.store().get_episode_statuses(id).await?;
    let mapped_paths: std::collections::HashMap<String, i32> = statuses
        .into_iter()
        .filter_map(|s| s.file_path.map(|p| (p, s.episode_number)))
        .collect();

    let mut files = collect_video_files(path).await;

    for file in &mut files {
        file.episode_number = mapped_paths.get(&file.path).copied();
    }

    let scanned_paths: std::collections::HashSet<String> =
        files.iter().map(|f| f.path.clone()).collect();

    for (path_str, ep_num) in &mapped_paths {
        if !scanned_paths.contains(path_str) {
            let path = std::path::Path::new(path_str);
            if path.exists() {
                tracing::debug!(path = %path_str, "Adding missing mapped file");
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let size = tokio::fs::metadata(path)
                    .await
                    .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
                    .unwrap_or(0);

                files.push(VideoFileDto {
                    name,
                    path: path_str.clone(),
                    size,
                    episode_number: Some(*ep_num),
                });
            } else {
                tracing::warn!(path = %path_str, "Mapped file missing from disk");
            }
        }
    }

    tracing::debug!(count = files.len(), "Found files");
    files.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(Json(ApiResponse::success(files)))
}

async fn collect_video_files(root: &std::path::Path) -> Vec<VideoFileDto> {
    const VIDEO_EXTENSIONS: &[&str] = crate::constants::VIDEO_EXTENSIONS;
    let mut files = Vec::new();
    let mut dirs_to_visit = std::collections::VecDeque::new();
    dirs_to_visit.push_back(root.to_path_buf());

    let mut visited = std::collections::HashSet::new();

    while let Some(current_dir) = dirs_to_visit.pop_front() {
        if !visited.insert(current_dir.clone()) {
            continue;
        }

        let mut entries = match tokio::fs::read_dir(&current_dir).await {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!(path = ?current_dir, error = %e, "Failed to read dir");
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
                        .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
                        .unwrap_or(0);

                    files.push(VideoFileDto {
                        name,
                        path: path_str,
                        size,
                        episode_number: None,
                    });
                }
            }
        }
    }
    files
}

async fn save_anime_images(state: &AppState, anime: &mut crate::models::anime::Anime) {
    if let Some(url) = &anime.cover_image {
        match state
            .image_service
            .save_image(url, anime.id, ImageType::Cover)
            .await
        {
            Ok(path) => anime.cover_image = Some(path),
            Err(e) => tracing::warn!(error = %e, "Failed to save cover image"),
        }
    }

    if let Some(url) = &anime.banner_image {
        match state
            .image_service
            .save_image(url, anime.id, ImageType::Banner)
            .await
        {
            Ok(path) => anime.banner_image = Some(path),
            Err(e) => tracing::warn!(error = %e, "Failed to save banner image"),
        }
    }
}

async fn recycle_episode_file(
    state: &AppState,
    anime_id: i32,
    episode_number: i32,
    status: &crate::models::episode::EpisodeStatusRow,
    path: &std::path::Path,
) -> Result<(), ApiError> {
    let config_guard = state.config().read().await;
    let recycle_path = config_guard.library.recycle_path.clone();
    let cleanup_days = config_guard.library.recycle_cleanup_days;
    drop(config_guard);

    let recycle_bin = crate::library::RecycleBin::new(recycle_path, cleanup_days);
    let path_str = path.to_string_lossy().to_string();

    match recycle_bin.recycle(path, "User triggered delete").await {
        Ok(recycled_file) => {
            state
                .store()
                .add_to_recycle_bin(
                    &path_str,
                    Some(recycled_file.recycled_path.to_str().unwrap_or_default()),
                    anime_id,
                    episode_number,
                    status.quality_id,
                    status.file_size,
                    "User triggered delete",
                )
                .await?;
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to recycle file");
            if let Err(e) = tokio::fs::remove_file(path).await {
                return Err(ApiError::internal(format!("Failed to delete file: {e}")));
            }
        }
    }
    Ok(())
}

pub async fn map_episode_file(
    State(state): State<Arc<AppState>>,
    Path((id, number)): Path<(i32, i32)>,
    Json(request): Json<MapEpisodeRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;
    validate_episode_number(number)?;

    let media_service = crate::services::MediaService::new();
    let mapping = crate::api::EpisodeMapping {
        episode_number: number,
        file_path: request.file_path,
    };

    map_single_episode(&state, id, mapping, &media_service).await?;

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
        if let Err(e) = map_single_episode(&state, id, mapping, &media_service).await {
            tracing::error!(error = %e, "Failed to map episode");
        }
    }

    Ok(Json(ApiResponse::success(())))
}

async fn map_single_episode(
    state: &AppState,
    anime_id: i32,
    mapping: crate::api::EpisodeMapping,
    media_service: &crate::services::MediaService,
) -> Result<(), ApiError> {
    if mapping.episode_number <= 0 {
        return Ok(());
    }

    if mapping.file_path.is_empty() {
        state
            .store()
            .clear_episode_download(anime_id, mapping.episode_number)
            .await?;
        return Ok(());
    }

    let path = std::path::Path::new(&mapping.file_path);
    if !path.exists() {
        tracing::warn!(
            episode = mapping.episode_number,
            path = ?path,
            "Skipping map: file not found"
        );
        return Ok(());
    }

    let file_size = tokio::fs::metadata(path)
        .await
        .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
        .ok();

    let media_info = media_service.get_media_info(path).ok();

    let filename = path.file_name().unwrap_or_default().to_string_lossy();
    let quality = crate::quality::parse_quality_from_filename(&filename);

    let existing_status = state
        .store()
        .get_episode_status(anime_id, mapping.episode_number)
        .await?;
    let season = existing_status.map_or(1, |s| s.season);

    state
        .store()
        .mark_episode_downloaded(
            anime_id,
            mapping.episode_number,
            season,
            quality.id,
            false,
            &mapping.file_path,
            file_size,
            media_info.as_ref(),
        )
        .await?;

    Ok(())
}
