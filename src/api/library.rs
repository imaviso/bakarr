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
    let total_anime = i32::try_from(anime_list.len()).unwrap_or(i32::MAX);
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
        rss_feeds: i32::try_from(feeds.len()).unwrap_or(i32::MAX),
        recent_downloads: i32::try_from(recent.len()).unwrap_or(i32::MAX),
    })))
}

pub async fn get_activity(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<ActivityItem>>>, ApiError> {
    let downloads = state.store().recent_downloads(20).await?;

    let mut activities = Vec::new();
    for download in downloads {
        let anime = state.store().get_anime(download.anime_id).await?;
        let anime_title = anime.map_or_else(
            || format!("Anime #{}", download.anime_id),
            |a| a.title.english.unwrap_or(a.title.romaji),
        );

        activities.push(ActivityItem {
            id: download.id,
            activity_type: "download".to_string(),
            anime_id: download.anime_id,
            anime_title,
            episode_number: Some(download.episode_number),
            description: format!("Downloaded episode {}", download.episode_number),
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
) -> Result<Json<ApiResponse<crate::services::scanner::ScannerState>>, ApiError> {
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
    let client = &state.shared.anilist;
    let mut anime = client
        .get_by_id(request.anime_id)
        .await
        .map_err(|e| ApiError::anilist_error(format!("Failed to fetch anime details: {e}")))?
        .ok_or_else(|| ApiError::anime_not_found(request.anime_id))?;

    let config = state.config().read().await;
    let library_path = Path::new(&config.library.library_path);
    let full_path = library_path.join(&request.folder_name);

    tracing::info!(
        library_path = ?library_path,
        folder_name = request.folder_name,
        full_path = ?full_path,
        "Importing folder"
    );

    if !full_path.exists() {
        return Err(ApiError::validation("Folder does not exist"));
    }

    anime.path = Some(full_path.to_string_lossy().to_string());
    tracing::debug!(path = ?anime.path, "Setting anime path");

    anime.quality_profile_id =
        resolve_quality_profile(&state, request.profile_name.as_ref(), &config).await?;
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

    spawn_post_import_tasks(&state, &anime, full_path);

    Ok(Json(ApiResponse::success(())))
}

async fn resolve_quality_profile(
    state: &AppState,
    profile_name: Option<&String>,
    config: &crate::config::Config,
) -> Result<Option<i32>, ApiError> {
    if let Some(name) = profile_name {
        if let Some(profile) = state.store().get_quality_profile_by_name(name).await? {
            return Ok(Some(profile.id));
        }
    } else if let Some(first_profile) = config.profiles.first()
        && let Some(profile) = state
            .store()
            .get_quality_profile_by_name(&first_profile.name)
            .await?
    {
        return Ok(Some(profile.id));
    }
    Ok(None)
}

fn spawn_post_import_tasks(
    state: &AppState,
    anime: &crate::models::anime::Anime,
    folder_path: std::path::PathBuf,
) {
    let anime_id = anime.id;
    let store = state.store().clone();
    let event_bus = state.event_bus().clone();

    tokio::spawn(async move {
        if let Err(e) = scan_folder_for_episodes(&store, &event_bus, anime_id, &folder_path).await {
            tracing::warn!(error = %e, "Failed to scan folder for episodes");
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
}

pub async fn scan_folder_for_episodes(
    store: &crate::db::Store,
    event_bus: &tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
    anime_id: i32,
    folder_path: &Path,
) -> anyhow::Result<()> {
    let start = std::time::Instant::now();
    let anime_title = match store.get_anime(anime_id).await? {
        Some(a) => a.title.romaji,
        None => format!("Anime #{anime_id}"),
    };

    let _ = event_bus.send(crate::api::NotificationEvent::ScanFolderStarted {
        anime_id,
        title: anime_title.clone(),
    });

    tracing::debug!(path = ?folder_path, "Scanning folder for episodes");

    let found_episodes = collect_and_parse_episodes(folder_path).await;

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
                episode = episode_number,
                error = %e,
                "Failed to mark episode as downloaded"
            );
        } else {
            tracing::debug!(
                episode = episode_number,
                path = %file_path,
                "Detected episode from folder scan"
            );
        }
    }

    let count = found_episodes.len();
    tracing::info!(
        event = "folder_scan_finished",
        anime_id = anime_id,
        found_episodes = count,
        duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
        "Folder scan finished"
    );

    let _ = event_bus.send(crate::api::NotificationEvent::ScanFolderFinished {
        anime_id,
        title: anime_title,
        found: i32::try_from(count).unwrap_or(i32::MAX),
    });

    Ok(())
}

async fn collect_and_parse_episodes(
    folder_path: &Path,
) -> Vec<(i32, Option<i32>, String, i32, Option<i64>)> {
    use crate::constants::VIDEO_EXTENSIONS;
    use crate::parser::filename::parse_filename;
    use crate::quality::parse_quality_from_filename;

    let mut dirs_to_visit = std::collections::VecDeque::new();
    dirs_to_visit.push_back(folder_path.to_path_buf());

    let mut found_episodes = Vec::new();
    let mut visited_paths = std::collections::HashSet::new();

    while let Some(current_dir) = dirs_to_visit.pop_front() {
        if !visited_paths.insert(current_dir.clone()) {
            continue;
        }

        let mut entries = match tokio::fs::read_dir(&current_dir).await {
            Ok(entries) => entries,
            Err(e) => {
                tracing::warn!(path = ?current_dir, error = %e, "Failed to read directory");
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

            if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                if VIDEO_EXTENSIONS.contains(&ext_lower.as_str())
                    && let Some(filename) = path.file_name()
                {
                    let filename_str = filename.to_string_lossy();
                    if let Some(parsed) = parse_filename(&filename_str) {
                        #[allow(clippy::cast_possible_truncation)]
                        let episode_number = parsed.episode_number.floor() as i32;
                        let quality = parse_quality_from_filename(&filename_str);
                        let file_size = tokio::fs::metadata(&path)
                            .await
                            .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
                            .ok();

                        found_episodes.push((
                            episode_number,
                            parsed.season,
                            path.to_string_lossy().to_string(),
                            quality.id,
                            file_size,
                        ));
                    }
                }
            }
        }
    }
    found_episodes
}
