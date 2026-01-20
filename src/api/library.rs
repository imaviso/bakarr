use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};

#[derive(Debug, Serialize)]
pub struct LibraryStats {
    pub total_anime: i32,
    pub total_episodes: i32,
    pub downloaded_episodes: i32,
    pub missing_episodes: i32,
    pub rss_feeds: i32,
    pub recent_downloads: i32,
}

#[derive(Debug, Serialize)]
pub struct ActivityItem {
    pub id: i64,
    pub activity_type: String,
    pub anime_id: i32,
    pub anime_title: String,
    pub episode_number: Option<f32>,
    pub description: String,
    pub timestamp: String,
}

pub async fn get_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<LibraryStats>>, ApiError> {
    let anime_list = state.store().list_monitored().await?;
    let total_anime = anime_list.len() as i32;
    let anime_ids: Vec<i32> = anime_list.iter().map(|a| a.id).collect();

    let download_counts = state
        .store()
        .get_download_counts_for_anime_ids(&anime_ids)
        .await?;
    let main_counts = state
        .store()
        .get_main_episode_download_counts(&anime_ids)
        .await?;

    let mut total_episodes = 0;
    let mut downloaded_episodes = 0;
    let mut missing_episodes = 0;

    for anime in &anime_list {
        let ep_count = anime.episode_count.unwrap_or(0);
        total_episodes += ep_count;

        let downloaded = download_counts.get(&anime.id).copied().unwrap_or(0);
        downloaded_episodes += downloaded;

        if ep_count > 0 {
            let main_downloaded = main_counts.get(&anime.id).copied().unwrap_or(0);
            let missing = (ep_count - main_downloaded).max(0);
            missing_episodes += missing;
        }
    }

    let feeds = state
        .store()
        .get_enabled_rss_feeds()
        .await
        .unwrap_or_default();
    let recent = state.store().recent_downloads(7).await.unwrap_or_default();

    Ok(Json(ApiResponse::success(LibraryStats {
        total_anime,
        total_episodes,
        downloaded_episodes,
        missing_episodes,
        rss_feeds: feeds.len() as i32,
        recent_downloads: recent.len() as i32,
    })))
}

pub async fn get_activity(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<ActivityItem>>>, ApiError> {
    let downloads = state.store().recent_downloads(20).await?;

    let mut activities = Vec::new();
    for download in downloads {
        let anime = state.store().get_anime(download.anime_id).await?;
        let anime_title = anime
            .map(|a| a.title.english.unwrap_or(a.title.romaji))
            .unwrap_or_else(|| format!("Anime #{}", download.anime_id));

        activities.push(ActivityItem {
            id: download.id,
            activity_type: "download".to_string(),
            anime_id: download.anime_id,
            anime_title,
            episode_number: Some(download.episode_number),
            description: format!("Downloaded episode {}", download.episode_number as i32),
            timestamp: download.download_date,
        });
    }

    Ok(Json(ApiResponse::success(activities)))
}

#[derive(Debug, Deserialize)]
pub struct ImportFolderRequest {
    pub folder_name: String,
    pub anime_id: i32,
    pub profile_name: Option<String>,
}

pub async fn get_unmapped_folders(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<crate::services::library::ScannerState>>, ApiError> {
    let scanner_state = state.library_scanner.get_state().await;
    Ok(Json(ApiResponse::success(scanner_state)))
}

pub async fn scan_library(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    state.library_scanner.start_scan().await;
    Ok(Json(ApiResponse::success(())))
}

pub async fn import_folder(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ImportFolderRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let client = crate::clients::anilist::AnilistClient::new();
    let mut anime = client
        .get_by_id(request.anime_id)
        .await
        .map_err(|e| ApiError::anilist_error(format!("Failed to fetch anime details: {}", e)))?
        .ok_or_else(|| ApiError::anime_not_found(request.anime_id))?;

    let config = state.config().read().await;
    let library_path = Path::new(&config.library.library_path);
    let full_path = library_path.join(&request.folder_name);

    tracing::info!(
        "Importing folder: library_path={:?}, folder_name={:?}, full_path={:?}",
        library_path,
        request.folder_name,
        full_path
    );

    if !full_path.exists() {
        return Err(ApiError::validation("Folder does not exist"));
    }

    anime.path = Some(full_path.to_string_lossy().to_string());
    tracing::info!("Setting anime path to: {:?}", anime.path);

    if let Some(profile_name) = &request.profile_name {
        if let Some(profile) = state
            .store()
            .get_quality_profile_by_name(profile_name)
            .await?
        {
            anime.quality_profile_id = Some(profile.id);
        }
    } else if let Some(first_profile) = config.profiles.first()
        && let Some(profile) = state
            .store()
            .get_quality_profile_by_name(&first_profile.name)
            .await?
    {
        anime.quality_profile_id = Some(profile.id);
    }
    drop(config);

    if state.store().get_anime(anime.id).await?.is_some() {
        return Err(ApiError::validation("Anime already exists in library"));
    }

    state
        .metadata_service
        .enrich_anime_metadata(&mut anime)
        .await;
    anime.added_at = chrono::Utc::now().to_rfc3339();

    state.store().add_anime(&anime).await?;

    let anime_id = anime.id;
    let folder_path = full_path.clone();
    let store = state.store().clone();
    let event_bus = state.event_bus().clone();

    tokio::spawn(async move {
        if let Err(e) = scan_folder_for_episodes(&store, &event_bus, anime_id, &folder_path).await {
            tracing::warn!("Failed to scan folder for episodes: {}", e);
        }
    });

    let image_service = state.image_service.clone();
    let anime_clone = anime.clone();
    tokio::spawn(async move {
        use crate::services::image::ImageType;
        if let Some(url) = &anime_clone.cover_image {
            let _ = image_service
                .save_image(url, anime_clone.id, ImageType::Cover)
                .await;
        }
        if let Some(url) = &anime_clone.banner_image {
            let _ = image_service
                .save_image(url, anime_clone.id, ImageType::Banner)
                .await;
        }
    });

    Ok(Json(ApiResponse::success(())))
}

pub async fn scan_folder_for_episodes(
    store: &crate::db::Store,
    event_bus: &tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
    anime_id: i32,
    folder_path: &Path,
) -> anyhow::Result<()> {
    use crate::constants::VIDEO_EXTENSIONS;
    use crate::parser::filename::parse_filename;
    use crate::quality::parse_quality_from_filename;

    let anime_title = match store.get_anime(anime_id).await? {
        Some(a) => a.title.romaji,
        None => format!("Anime #{}", anime_id),
    };

    let _ = event_bus.send(crate::api::NotificationEvent::ScanFolderStarted {
        anime_id,
        title: anime_title.clone(),
    });

    tracing::info!("Scanning folder for episodes: {:?}", folder_path);

    let mut dirs_to_visit = std::collections::VecDeque::new();
    dirs_to_visit.push_back(folder_path.to_path_buf());

    let mut found_episodes = Vec::new();
    let mut visited_paths = std::collections::HashSet::new();

    while let Some(current_dir) = dirs_to_visit.pop_front() {
        if !visited_paths.insert(current_dir.clone()) {
            continue;
        }

        tracing::debug!("Scanning directory: {:?}", current_dir);

        let mut entries = match tokio::fs::read_dir(&current_dir).await {
            Ok(entries) => entries,
            Err(e) => {
                tracing::warn!("Failed to read directory {:?}: {}", current_dir, e);
                continue;
            }
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();

            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str())
                    && !name.starts_with('.')
                {
                    dirs_to_visit.push_back(path);
                }
                continue;
            }

            tracing::debug!("Checking file: {:?}", path);

            if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                if VIDEO_EXTENSIONS.contains(&ext_lower.as_str()) {
                    if let Some(filename) = path.file_name() {
                        let filename_str = filename.to_string_lossy();
                        tracing::debug!("Parsing filename: {}", filename_str);

                        if let Some(parsed) = parse_filename(&filename_str) {
                            tracing::info!(
                                "Parsed episode {} from: {}",
                                parsed.episode_number,
                                filename_str
                            );
                            let episode_number = parsed.episode_number as i32;
                            let quality = parse_quality_from_filename(&filename_str);
                            let quality_id = quality.id;

                            let file_size = tokio::fs::metadata(&path)
                                .await
                                .map(|m| m.len() as i64)
                                .ok();

                            let season = parsed.season;

                            found_episodes.push((
                                episode_number,
                                season,
                                path.to_string_lossy().to_string(),
                                quality_id,
                                file_size,
                            ));
                        } else {
                            tracing::warn!("Failed to parse episode number from: {}", filename_str);
                        }
                    }
                } else {
                    tracing::debug!("Skipping non-video extension: {:?}", ext);
                }
            }
        }
    }

    for (episode_number, season, file_path, quality_id, file_size) in &found_episodes {
        if let Err(e) = store
            .mark_episode_downloaded(
                anime_id,
                *episode_number,
                season.unwrap_or(1),
                *quality_id,
                false,
                file_path,
                *file_size,
                None,
            )
            .await
        {
            tracing::warn!(
                "Failed to mark episode {} as downloaded: {}",
                episode_number,
                e
            );
        } else {
            tracing::info!(
                "Detected episode {} from folder scan: {}",
                episode_number,
                file_path
            );
        }
    }

    let _ = event_bus.send(crate::api::NotificationEvent::ScanFolderFinished {
        anime_id,
        title: anime_title,
        found: found_episodes.len() as i32,
    });

    Ok(())
}
