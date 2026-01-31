use axum::{
    Json,
    extract::{Path, State},
};
use serde::Deserialize;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
use crate::domain::AnimeId;
pub use crate::services::rss::RssFeedDto;

#[derive(Debug, Deserialize)]
pub struct AddRssFeedRequest {
    pub anime_id: i32,
    pub url: String,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ToggleFeedRequest {
    pub enabled: bool,
}

pub async fn list_feeds(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<RssFeedDto>>>, ApiError> {
    let dtos = state
        .rss_service
        .list_feeds()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn get_feeds_for_anime(
    State(state): State<Arc<AppState>>,
    Path(anime_id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<RssFeedDto>>>, ApiError> {
    let dtos = state
        .rss_service
        .get_feeds_for_anime(AnimeId::new(anime_id))
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn add_feed(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddRssFeedRequest>,
) -> Result<Json<ApiResponse<RssFeedDto>>, ApiError> {
    let dto = state
        .rss_service
        .add_feed(
            AnimeId::new(payload.anime_id),
            &payload.url,
            payload.name.as_deref(),
        )
        .await
        .map_err(|e| match e {
            crate::services::rss::RssError::AnimeNotFound(_) => ApiError::anime_not_found(payload.anime_id),
            _ => ApiError::internal(e.to_string()),
        })?;

    Ok(Json(ApiResponse::success(dto)))
}

pub async fn delete_feed(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, ApiError> {
    let deleted = state
        .rss_service
        .delete_feed(id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    if deleted {
        Ok(Json(ApiResponse::success(true)))
    } else {
        Err(ApiError::not_found("RSS feed", id))
    }
}

pub async fn toggle_feed(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<ToggleFeedRequest>,
) -> Result<Json<ApiResponse<bool>>, ApiError> {
    let updated = state
        .rss_service
        .toggle_feed(id, payload.enabled)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    if updated {
        Ok(Json(ApiResponse::success(true)))
    } else {
        Err(ApiError::not_found("RSS feed", id))
    }
}
