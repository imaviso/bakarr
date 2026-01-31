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
use crate::domain::{AnimeId, EpisodeNumber};

/// Lists all episodes for a specific anime.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `500 Internal Server Error` on database failures
pub async fn list_episodes(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<EpisodeDto>>>, ApiError> {
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    // Delegate to episode service
    let episodes = state.episode_service().list_episodes(anime_id).await?;

    Ok(Json(ApiResponse::success(episodes)))
}

/// Lists missing episode numbers for a specific anime.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `500 Internal Server Error` on database failures
pub async fn missing_episodes(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<i32>>>, ApiError> {
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    // Delegate to episode service
    let missing = state
        .episode_service()
        .get_missing_episodes(anime_id)
        .await?;

    Ok(Json(ApiResponse::success(missing)))
}

/// Gets details for a specific episode.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime or episode does not exist
/// - Returns `500 Internal Server Error` on database failures
pub async fn get_episode(
    State(state): State<Arc<AppState>>,
    Path((id, number)): Path<(i32, i32)>,
) -> Result<Json<ApiResponse<EpisodeDto>>, ApiError> {
    validate_anime_id(id)?;
    validate_episode_number(number)?;

    let anime_id = AnimeId::new(id);
    // Episode numbers are typically < 1000, well within f32 precision (2^24)
    #[allow(clippy::cast_precision_loss)]
    let episode_number = EpisodeNumber::new(number as f32);

    // Delegate to episode service
    let episode = state
        .episode_service()
        .get_episode(anime_id, episode_number)
        .await?;

    Ok(Json(ApiResponse::success(episode)))
}

/// Refreshes metadata for an anime's episodes from external sources.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `500 Internal Server Error` on database or API failures
pub async fn refresh_metadata(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<usize>>, ApiError> {
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    // Delegate to episode service
    let count = state.episode_service().refresh_metadata(anime_id).await?;

    Ok(Json(ApiResponse::success(count)))
}

/// Deletes the file associated with an episode.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime or episode does not exist
/// - Returns `400 Bad Request` if no file is associated with the episode
/// - Returns `500 Internal Server Error` on file system errors
pub async fn delete_episode_file(
    State(state): State<Arc<AppState>>,
    Path((id, number)): Path<(i32, i32)>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;
    validate_episode_number(number)?;

    let anime_id = AnimeId::new(id);
    // Episode numbers are typically < 1000, well within f32 precision (2^24)
    #[allow(clippy::cast_precision_loss)]
    let episode_number = EpisodeNumber::new(number as f32);

    // Delegate to episode service
    state
        .episode_service()
        .delete_file(anime_id, episode_number)
        .await?;

    Ok(Json(ApiResponse::success(())))
}

/// Scans the anime's folder for episodes.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `400 Bad Request` if the folder path is invalid
/// - Returns `500 Internal Server Error` on file system errors
pub async fn scan_folder(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<crate::api::types::ScanFolderResult>>, ApiError> {
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    // Delegate to episode service
    let result = state.episode_service().scan_folder(anime_id).await?;

    Ok(Json(ApiResponse::success(result)))
}

/// Lists video files in the anime's folder.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `400 Bad Request` if the folder path is invalid
/// - Returns `500 Internal Server Error` on file system errors
pub async fn list_files(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<VideoFileDto>>>, ApiError> {
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    // Delegate to episode service
    let files = state.episode_service().list_files(anime_id).await?;

    Ok(Json(ApiResponse::success(files)))
}

/// Maps a file to a specific episode.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `400 Bad Request` if the episode number or file path is invalid
/// - Returns `500 Internal Server Error` on file system errors
pub async fn map_episode_file(
    State(state): State<Arc<AppState>>,
    Path((id, number)): Path<(i32, i32)>,
    Json(request): Json<MapEpisodeRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;
    validate_episode_number(number)?;

    let anime_id = AnimeId::new(id);
    // Episode numbers are typically < 1000, well within f32 precision (2^24)
    #[allow(clippy::cast_precision_loss)]
    let episode_number = EpisodeNumber::new(number as f32);

    // Delegate to episode service
    state
        .episode_service()
        .map_file(anime_id, episode_number, request.file_path)
        .await?;

    Ok(Json(ApiResponse::success(())))
}

/// Maps multiple files to episodes in bulk.
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `500 Internal Server Error` on file system errors
pub async fn bulk_map_episodes(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(request): Json<BulkMapEpisodeRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    // Convert mappings to the format expected by the service
    // Episode numbers are typically < 1000, well within f32 precision (2^24)
    #[allow(clippy::cast_precision_loss)]
    let mappings: Vec<(EpisodeNumber, String)> = request
        .mappings
        .into_iter()
        .map(|m| (EpisodeNumber::new(m.episode_number as f32), m.file_path))
        .collect();

    // Delegate to episode service
    state
        .episode_service()
        .bulk_map_files(anime_id, mappings)
        .await?;

    Ok(Json(ApiResponse::success(())))
}
