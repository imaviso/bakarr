use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::Deserialize;
use std::sync::Arc;

use super::{
    AnimeDto, ApiError, ApiResponse, AppState, EpisodeProgress, SearchResultDto, TitleDto,
};
use crate::api::validation::{validate_anime_id, validate_search_query};
use crate::clients::anilist::AnilistClient;

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Deserialize)]
pub struct AddAnimeRequest {
    pub id: i32,
    pub profile_name: Option<String>,
    pub root_folder: Option<String>,
    #[serde(default)]
    pub monitor_and_search: bool,
    #[serde(default = "default_true")]
    pub monitored: bool,
}

fn default_true() -> bool {
    true
}

pub async fn list_anime(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<AnimeDto>>>, ApiError> {
    let anime_list = state.store().list_all_anime().await?;
    let library_path = state.config().read().await.library.library_path.clone();

    let mut results = Vec::new();
    for anime in anime_list {
        let downloaded = state
            .store()
            .get_downloaded_count(anime.id)
            .await
            .unwrap_or(0);

        let missing = if let Some(total) = anime.episode_count {
            state
                .store()
                .get_missing_episodes(anime.id, total)
                .await
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        results.push(AnimeDto {
            id: anime.id,
            title: TitleDto {
                romaji: anime.title.romaji.clone(),
                english: anime.title.english.clone(),
                native: anime.title.native.clone(),
            },
            format: anime.format,
            episode_count: anime.episode_count.map(|c| c as i64),
            status: anime.status,
            cover_image: anime.cover_image.map(|p| format!("/images/{}", p)),
            banner_image: anime.banner_image.map(|p| format!("/images/{}", p)),
            profile_name: anime
                .profile_name
                .clone()
                .unwrap_or_else(|| "Unknown".to_string()),
            root_folder: anime.path.clone().unwrap_or_else(|| {
                let folder_name = if let Some(year) = anime.start_year {
                    format!("{} ({})", anime.title.romaji, year)
                } else {
                    anime.title.romaji.clone()
                };
                let sanitized = crate::clients::qbittorrent::sanitize_category(&folder_name);

                std::path::Path::new(&library_path)
                    .join(sanitized)
                    .to_string_lossy()
                    .to_string()
            }),
            monitored: anime.monitored,
            added_at: anime.added_at,
            mal_id: anime.mal_id,
            description: anime.description,
            score: anime.score,
            genres: anime.genres.clone().unwrap_or_default(),
            studios: anime.studios.clone().unwrap_or_default(),
            progress: EpisodeProgress {
                downloaded: downloaded as i64,
                total: anime.episode_count.map(|c| c as i64),
                missing,
            },
        });
    }

    Ok(Json(ApiResponse::success(results)))
}

pub async fn search_anime(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<ApiResponse<Vec<SearchResultDto>>>, ApiError> {
    validate_search_query(&params.q)?;
    let client = AnilistClient::new();

    let monitored = state.store().list_monitored().await?;
    let monitored_ids: std::collections::HashSet<i32> = monitored.iter().map(|a| a.id).collect();

    let results = client
        .search_anime(&params.q)
        .await
        .map_err(|e| ApiError::anilist_error(e.to_string()))?;

    let dtos: Vec<SearchResultDto> = results
        .into_iter()
        .map(|anime| SearchResultDto {
            id: anime.id,
            title: TitleDto {
                romaji: anime.title.romaji,
                english: anime.title.english,
                native: anime.title.native,
            },
            format: anime.format,
            episode_count: anime.episode_count,
            status: anime.status,
            cover_image: None,
            already_in_library: monitored_ids.contains(&anime.id),
        })
        .collect();

    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn add_anime(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddAnimeRequest>,
) -> Result<Json<ApiResponse<AnimeDto>>, ApiError> {
    validate_anime_id(payload.id)?;
    let client = AnilistClient::new();

    let mut anime = client
        .get_by_id(payload.id)
        .await
        .map_err(|e| ApiError::anilist_error(e.to_string()))?
        .ok_or_else(|| ApiError::anime_not_found(payload.id))?;

    if let Some(profile_name) = &payload.profile_name {
        let profile = state
            .store()
            .get_quality_profile_by_name(profile_name)
            .await?;

        if let Some(profile) = profile {
            anime.quality_profile_id = Some(profile.id);
        }
    }

    let library_config = state.config().read().await.library.clone();
    let library_service = crate::library::LibraryService::new(library_config);

    let dummy_options = crate::library::RenamingOptions {
        anime: anime.clone(),
        episode_number: 1,
        season: Some(1),
        episode_title: "Dummy".to_string(),
        quality: None,
        group: None,
        original_filename: None,
        extension: "mkv".to_string(),
        year: anime.start_year,
        media_info: None,
    };

    let formatted_path = library_service.format_path(&dummy_options);
    let path_buf = std::path::PathBuf::from(&formatted_path);

    let folder_name = if let Some(component) = path_buf.components().next() {
        component.as_os_str().to_string_lossy().to_string()
    } else if let Some(year) = anime.start_year {
        format!("{} ({})", anime.title.romaji, year)
    } else {
        anime.title.romaji.clone()
    };

    let sanitized_name = crate::clients::qbittorrent::sanitize_category(&folder_name);

    let root_path = if let Some(base) = &payload.root_folder {
        std::path::Path::new(base)
            .join(&sanitized_name)
            .to_string_lossy()
            .to_string()
    } else {
        let library_base = state
            .config()
            .try_read()
            .map(|c| c.library.library_path.clone())
            .unwrap_or_default();

        std::path::Path::new(&library_base)
            .join(&sanitized_name)
            .to_string_lossy()
            .to_string()
    };

    if let Err(e) = std::fs::create_dir_all(&root_path) {
        tracing::error!("Failed to create anime directory: {}", e);
    }

    anime.path = Some(root_path.clone());

    state
        .metadata_service
        .enrich_anime_metadata(&mut anime)
        .await;

    if let Some(url) = &anime.cover_image {
        match state
            .image_service
            .save_image(url, anime.id, crate::services::image::ImageType::Cover)
            .await
        {
            Ok(path) => anime.cover_image = Some(path),
            Err(e) => tracing::warn!("Failed to save cover image: {}", e),
        }
    }

    if let Some(url) = &anime.banner_image {
        match state
            .image_service
            .save_image(url, anime.id, crate::services::image::ImageType::Banner)
            .await
        {
            Ok(path) => anime.banner_image = Some(path),
            Err(e) => tracing::warn!("Failed to save banner image: {}", e),
        }
    }

    anime.added_at = chrono::Utc::now().to_rfc3339();
    anime.monitored = payload.monitored;

    state.store().add_anime(&anime).await?;

    if payload.monitor_and_search {
        let search_service = state.search_service().clone();
        let anime_id = anime.id;
        let store = state.store().clone();
        let qbit = state.qbit().clone();

        let anime_title_romaji = anime.title.romaji.clone();

        tokio::spawn(async move {
            tracing::info!("Starting initial search for anime: {}", anime_id);

            match search_service.search_anime(anime_id).await {
                Ok(results) => {
                    for result in results.iter().take(10) {
                        if let crate::services::download::DownloadAction::Accept {
                            quality: _,
                            is_seadex: _,
                        } = &result.download_action
                            && let Some(qbit) = &qbit
                        {
                            let category =
                                crate::clients::qbittorrent::sanitize_category(&anime_title_romaji);
                            let _ = qbit.create_category(&category, None).await;

                            let options = crate::clients::qbittorrent::AddTorrentOptions {
                                category: Some(category.clone()),
                                save_path: None,
                                ..Default::default()
                            };

                            if qbit
                                .add_torrent_url(&result.link, Some(options))
                                .await
                                .is_ok()
                            {
                                tracing::info!("✓ [Auto-Search] Queued: {}", result.title);

                                let _ = store
                                    .record_download(
                                        anime_id,
                                        &result.title,
                                        result.episode_number,
                                        result.group.as_deref(),
                                        Some(&result.info_hash),
                                    )
                                    .await;
                            }
                        }
                    }
                }
                Err(e) => tracing::error!("Initial search failed: {}", e),
            }
        });
    }

    let dto = AnimeDto {
        id: anime.id,
        title: TitleDto {
            romaji: anime.title.romaji.clone(),
            english: anime.title.english.clone(),
            native: anime.title.native.clone(),
        },
        format: anime.format,
        episode_count: anime.episode_count.map(|c| c as i64),
        cover_image: anime.cover_image.map(|p| format!("/images/{}", p)),
        banner_image: anime.banner_image.map(|p| format!("/images/{}", p)),
        status: anime.status.clone(),
        profile_name: payload
            .profile_name
            .clone()
            .unwrap_or_else(|| "Unknown".to_string()),
        root_folder: root_path,
        monitored: anime.monitored,
        added_at: anime.added_at,
        mal_id: anime.mal_id,
        description: anime.description,
        score: anime.score,
        genres: anime.genres.clone().unwrap_or_default(),
        studios: anime.studios.clone().unwrap_or_default(),
        progress: EpisodeProgress {
            downloaded: 0i64,
            total: anime.episode_count.map(|c| c as i64),
            missing: Vec::new(),
        },
    };

    Ok(Json(ApiResponse::success(dto)))
}

pub async fn get_anime(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<AnimeDto>>, ApiError> {
    validate_anime_id(id)?;
    let anime = state
        .store()
        .get_anime(id)
        .await?
        .ok_or_else(|| ApiError::anime_not_found(id))?;

    let downloaded = state
        .store()
        .get_downloaded_count(anime.id)
        .await
        .unwrap_or(0);

    let missing = if let Some(total) = anime.episode_count {
        state
            .store()
            .get_missing_episodes(anime.id, total)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let root_folder = if let Some(path) = &anime.path {
        path.clone()
    } else {
        std::path::Path::new(&state.config().read().await.library.library_path)
            .join(&anime.title.romaji)
            .to_string_lossy()
            .to_string()
    };

    let dto = AnimeDto {
        id: anime.id,
        title: TitleDto {
            romaji: anime.title.romaji.clone(),
            english: anime.title.english.clone(),
            native: anime.title.native.clone(),
        },
        format: anime.format,
        episode_count: anime.episode_count.map(|c| c as i64),
        status: anime.status,
        cover_image: anime.cover_image.map(|p| format!("/images/{}", p)),
        banner_image: anime.banner_image.map(|p| format!("/images/{}", p)),
        profile_name: anime
            .profile_name
            .clone()
            .unwrap_or_else(|| "Unknown".to_string()),
        root_folder,
        monitored: anime.monitored,
        added_at: anime.added_at,
        mal_id: anime.mal_id,
        description: anime.description,
        score: anime.score,
        genres: anime.genres.clone().unwrap_or_default(),
        studios: anime.studios.clone().unwrap_or_default(),
        progress: EpisodeProgress {
            downloaded: downloaded as i64,
            total: anime.episode_count.map(|c| c as i64),
            missing,
        },
    };

    Ok(Json(ApiResponse::success(dto)))
}

pub async fn remove_anime(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;

    if state.store().get_anime(id).await?.is_none() {
        return Err(ApiError::anime_not_found(id));
    }
    state.store().remove_anime(id).await?;

    Ok(Json(ApiResponse::success(())))
}

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub profile_name: String,
}

pub async fn update_anime_profile(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;

    if state.store().get_anime(id).await?.is_none() {
        return Err(ApiError::anime_not_found(id));
    }

    let profile = state
        .store()
        .get_quality_profile_by_name(&payload.profile_name)
        .await?
        .ok_or_else(|| {
            ApiError::validation(format!("Profile not found: {}", payload.profile_name))
        })?;

    state
        .store()
        .update_anime_quality_profile(id, profile.id)
        .await?;

    Ok(Json(ApiResponse::success(())))
}


#[derive(Deserialize)]
pub struct MonitorToggleRequest {
    pub monitored: bool,
}

pub async fn toggle_monitor(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<MonitorToggleRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;

    if state.store().get_anime(id).await?.is_none() {
        return Err(ApiError::anime_not_found(id));
    }

    state.store().toggle_monitor(id, payload.monitored).await?;

    Ok(Json(ApiResponse::success(())))
}

#[derive(Deserialize)]
pub struct UpdatePathRequest {
    pub path: String,
    #[serde(default)]
    pub rescan: bool,
}

pub async fn update_anime_path(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdatePathRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;

    if state.store().get_anime(id).await?.is_none() {
        return Err(ApiError::anime_not_found(id));
    }

    let path = std::path::Path::new(&payload.path);
    if !path.exists() {
        return Err(ApiError::validation(format!(
            "Path does not exist: {}",
            payload.path
        )));
    }

    state.store().update_anime_path(id, &payload.path).await?;

    if payload.rescan {
        let store = state.store().clone();
        let event_bus = state.event_bus().clone();
        let folder_path = path.to_path_buf();
        let anime_id = id;

        tokio::spawn(async move {
            if let Err(e) = crate::api::library::scan_folder_for_episodes(
                &store,
                &event_bus,
                anime_id,
                &folder_path,
            )
            .await
            {
                tracing::warn!("Failed to scan folder for episodes: {}", e);
            }
        });
    }

    Ok(Json(ApiResponse::success(())))
}
