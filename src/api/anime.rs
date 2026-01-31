use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::Deserialize;
use std::sync::Arc;

use super::{
    AnimeDto, ApiError, ApiResponse, AppState, SearchResultDto, TitleDto,
};
use crate::api::validation::{validate_anime_id, validate_search_query};
use crate::services::AnimeService;

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
    #[serde(default)]
    pub release_profile_ids: Vec<i32>,
}

const fn default_true() -> bool {
    true
}

/// Lists all anime in the library.
///
/// Delegates to `AnimeService::list_all_anime` which handles:
/// - Parallel fetching of download counts, missing episodes, and release profiles
/// - O(N) missing episode calculation
/// - DTO conversion with root folder path generation
///
/// # Errors
///
/// Returns `500 Internal Server Error` on database failures.
pub async fn list_anime(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<AnimeDto>>>, ApiError> {
    let results = state.anime_service().list_all_anime().await?;
    Ok(Json(ApiResponse::success(results)))
}

pub async fn search_anime(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<ApiResponse<Vec<SearchResultDto>>>, ApiError> {
    validate_search_query(&params.q)?;
    let client = &state.shared.anilist;

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
            cover_image: anime.cover_image,
            already_in_library: monitored_ids.contains(&anime.id),
        })
        .collect();

    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn get_anime_by_anilist_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<SearchResultDto>>, ApiError> {
    validate_anime_id(id)?;
    let client = &state.shared.anilist;

    let monitored = state.store().list_monitored().await?;
    let monitored_ids: std::collections::HashSet<i32> = monitored.iter().map(|a| a.id).collect();

    let anime = client
        .get_by_id(id)
        .await
        .map_err(|e| ApiError::anilist_error(e.to_string()))?;

    let dto = anime.map(|a| SearchResultDto {
        id: a.id,
        title: TitleDto {
            romaji: a.title.romaji,
            english: a.title.english,
            native: a.title.native,
        },
        format: a.format,
        episode_count: a.episode_count,
        status: a.status,
        cover_image: a.cover_image,
        already_in_library: monitored_ids.contains(&a.id),
    });

    dto.map_or_else(
        || Err(ApiError::anime_not_found(id)),
        |d| Ok(Json(ApiResponse::success(d))),
    )
}

fn spawn_initial_search(state: &AppState, anime_id: i32, title: &str) {
    let search_service = state.search_service().clone();
    let store = state.store().clone();
    let qbit = state.qbit().clone();
    let title = title.to_string();

    tokio::spawn(async move {
        tracing::info!("Starting initial search for anime: {}", anime_id);

        match search_service.search_anime(anime_id).await {
            Ok(results) => {
                for result in results.iter().take(10) {
                    if let crate::services::download::DownloadAction::Accept { .. } =
                        &result.download_action
                        && let Some(qbit) = &qbit
                    {
                        let category = crate::clients::qbittorrent::sanitize_category(&title);
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

pub async fn add_anime(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddAnimeRequest>,
) -> Result<Json<ApiResponse<AnimeDto>>, ApiError> {
    use crate::domain::AnimeId;

    // Validate and convert to strong type
    validate_anime_id(payload.id)?;
    let anime_id = AnimeId::new(payload.id);

    // Delegate to domain service - handles all logic including:
    // - Fetching from AniList
    // - Setting quality profile
    // - Resolving and creating root folder path
    // - Downloading and caching images
    // - Enriching metadata
    // - Database operations
    let anime_dto = AnimeService::add_anime(
        state.anime_service().as_ref(),
        anime_id,
        payload.profile_name,
        payload.root_folder,
        payload.monitored,
        &payload.release_profile_ids,
    )
    .await?;

    // Spawn initial search if requested (fire-and-forget, stays in handler)
    if payload.monitor_and_search {
        spawn_initial_search(&state, anime_dto.id, &anime_dto.title.romaji);
    }

    Ok(Json(ApiResponse::success(anime_dto)))
}

/// Retrieves detailed information for a specific anime.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `500 Internal Server Error` on database failures
///
/// # Examples
///
/// ```rust,ignore
/// use axum::extract::{Path, State};
/// use std::sync::Arc;
///
/// async fn example(State(state): State<Arc<AppState>>) -> Result<Json<ApiResponse<AnimeDto>>, ApiError> {
///     get_anime(State(state), Path(1)).await
/// }
/// ```
pub async fn get_anime(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<AnimeDto>>, ApiError> {
    use crate::domain::AnimeId;

    // Validate and convert to strong type (C-NEWTYPE)
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    // Delegate to domain service (Separation of Concerns, Testability)
    // All database queries are parallelized within the service
    let anime_dto =
        AnimeService::get_anime_details(state.anime_service().as_ref(), anime_id).await?;

    Ok(Json(ApiResponse::success(anime_dto)))
}

/// Removes an anime from the library.
///
/// Delegates to `AnimeService::remove_anime` for domain validation and deletion.
///
/// # Errors
///
/// - Returns `404 Not Found` if anime does not exist
/// - Returns `500 Internal Server Error` on database failures
pub async fn remove_anime(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    use crate::domain::AnimeId;

    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    state.anime_service().remove_anime(anime_id).await?;
    Ok(Json(ApiResponse::success(())))
}

#[derive(Deserialize)]
pub struct UpdateReleaseProfilesRequest {
    pub release_profile_ids: Vec<i32>,
}

/// Updates the release profiles assigned to an anime.
///
/// Delegates to `AnimeService::assign_release_profiles` for domain validation and update.
///
/// # Errors
///
/// - Returns `404 Not Found` if anime does not exist
/// - Returns `500 Internal Server Error` on database failures
pub async fn update_anime_release_profiles(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateReleaseProfilesRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    use crate::domain::AnimeId;

    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    state
        .anime_service()
        .assign_release_profiles(anime_id, payload.release_profile_ids)
        .await?;

    Ok(Json(ApiResponse::success(())))
}

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub profile_name: String,
}

/// Updates the quality profile for an anime.
///
/// Delegates to `AnimeService::update_quality_profile` for domain validation and update.
///
/// # Errors
///
/// - Returns `404 Not Found` if anime or profile does not exist
/// - Returns `500 Internal Server Error` on database failures
pub async fn update_anime_profile(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    use crate::domain::AnimeId;

    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    state
        .anime_service()
        .update_quality_profile(anime_id, payload.profile_name)
        .await?;

    Ok(Json(ApiResponse::success(())))
}

#[derive(Deserialize)]
pub struct MonitorToggleRequest {
    pub monitored: bool,
}

/// Toggles the monitoring status of an anime.
///
/// Delegates to `AnimeService::toggle_monitor` for domain validation and update.
///
/// # Errors
///
/// - Returns `404 Not Found` if anime does not exist
/// - Returns `500 Internal Server Error` on database failures
pub async fn toggle_monitor(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<MonitorToggleRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    use crate::domain::AnimeId;

    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    state
        .anime_service()
        .toggle_monitor(anime_id, payload.monitored)
        .await?;

    Ok(Json(ApiResponse::success(())))
}

#[derive(Deserialize)]
pub struct UpdatePathRequest {
    pub path: String,
    #[serde(default)]
    pub rescan: bool,
}

/// Updates the file system path for an anime.
///
/// Delegates to `AnimeService::update_anime_path` for path validation and database update.
/// Spawns a background task to rescan episodes if `rescan` is true.
///
/// # Errors
///
/// - Returns `404 Not Found` if anime does not exist
/// - Returns `400 Bad Request` if path does not exist
/// - Returns `500 Internal Server Error` on database failures
pub async fn update_anime_path(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdatePathRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    use crate::domain::AnimeId;

    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    state
        .anime_service()
        .update_anime_path(anime_id, payload.path.clone())
        .await?;

    if payload.rescan {
        let store = state.store().clone();
        let event_bus = state.event_bus().clone();
        let folder_path = std::path::PathBuf::from(&payload.path);
        let anime_id = id;

        tokio::spawn(async move {
            if let Err(e) = crate::services::scan_folder_for_episodes(
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
