use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState, DownloadDto, QueueItemDto};
use crate::api::validation::{validate_anime_id, validate_limit};
use crate::domain::AnimeId;

#[derive(Deserialize)]
pub struct HistoryQuery {
    #[serde(default = "default_limit")]
    pub limit: usize,
}

const fn default_limit() -> usize {
    50
}

/// Retrieves download history with anime titles.
///
/// # Errors
///
/// - Returns `400 Bad Request` if limit is invalid
/// - Returns `500 Internal Server Error` on database failures
pub async fn get_history(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HistoryQuery>,
) -> Result<Json<ApiResponse<Vec<DownloadDto>>>, ApiError> {
    validate_limit(params.limit)?;

    // Delegate to download service (uses optimized eager loading)
    let downloads = state
        .download_service()
        .get_history(params.limit)
        .await?;

    Ok(Json(ApiResponse::success(downloads)))
}

/// Retrieves current download queue from qBittorrent enriched with metadata.
///
/// # Errors
///
/// - Returns `500 Internal Server Error` on database or qBittorrent failures
pub async fn get_queue(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<QueueItemDto>>>, ApiError> {
    // Delegate to download service (uses batch fetching)
    let queue = state.download_service().get_queue().await?;

    Ok(Json(ApiResponse::success(queue)))
}

#[derive(Deserialize, Default)]
pub struct SearchMissingRequest {
    pub anime_id: Option<i32>,
}

/// Triggers a search for missing episodes.
///
/// If `anime_id` is provided, searches only that anime. Otherwise performs
/// a global search across all monitored anime with missing episodes.
///
/// # Errors
///
/// - Returns `404 Not Found` if specific anime doesn't exist
/// - Returns `500 Internal Server Error` on internal failures
pub async fn search_missing(
    State(state): State<Arc<AppState>>,
    body: Option<Json<SearchMissingRequest>>,
) -> Result<Json<ApiResponse<String>>, ApiError> {
    let payload = body.map(|j| j.0).unwrap_or_default();

    // Validate anime_id if provided
    if let Some(id) = payload.anime_id {
        validate_anime_id(id)?;
    }

    // Convert to AnimeId if provided
    let anime_id = payload.anime_id.map(AnimeId::new);

    // Delegate to download service (handles background spawning internally)
    state
        .download_service()
        .search_missing(anime_id)
        .await?;

    let message = if payload.anime_id.is_some() {
        "Search for missing episodes triggered"
    } else {
        "Global search triggered in background"
    };

    Ok(Json(ApiResponse::success(message.to_string())))
}
