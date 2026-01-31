use axum::{
    Json,
    extract::{self, Query, State},
};
use serde::Deserialize;
use std::sync::Arc;

use crate::api::validation::validate_anime_id;
use crate::domain::AnimeId;
use crate::services::search::{ManualSearchResults, SearchResult};

use super::{ApiError, ApiResponse, AppState};

#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub anime_id: Option<i32>,
    pub category: Option<String>,
    pub filter: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DownloadRequest {
    pub anime_id: i32,
    pub magnet: String,
    pub episode_number: f32,
    pub group: Option<String>,
    pub title: String,
    pub info_hash: Option<String>,
    pub is_batch: Option<bool>,
}

pub async fn search_releases(
    State(state): State<Arc<AppState>>,
    Query(request): Query<SearchRequest>,
) -> Result<Json<ApiResponse<ManualSearchResults>>, ApiError> {
    let results = state
        .search_service()
        .search_releases(
            &request.query,
            request.category.as_deref(),
            request.filter.as_deref(),
            request.anime_id,
        )
        .await
        .map_err(|e| ApiError::internal(format!("Search failed: {e}")))?;

    Ok(Json(ApiResponse::success(results)))
}

pub async fn search_episode(
    State(state): State<Arc<AppState>>,
    extract::Path((anime_id, episode_number)): extract::Path<(i32, i32)>,
) -> Result<Json<ApiResponse<Vec<SearchResult>>>, ApiError> {
    let results = state
        .search_service()
        .search_episode(anime_id, episode_number)
        .await
        .map_err(|e| ApiError::internal(format!("Search failed: {e}")))?;

    Ok(Json(ApiResponse::success(results)))
}

pub async fn download_release(
    State(state): State<Arc<AppState>>,
    Json(request): Json<DownloadRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    validate_anime_id(request.anime_id)?;

    state
        .download_service()
        .download_release(
            AnimeId::new(request.anime_id),
            request.magnet,
            request.episode_number,
            request.title,
            request.group,
            request.info_hash,
            request.is_batch == Some(true),
        )
        .await
        .map_err(|e| ApiError::internal(format!("Download failed: {e}")))?;

    Ok(Json(ApiResponse::success(())))
}
