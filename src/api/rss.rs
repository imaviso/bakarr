use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};

#[derive(Debug, Serialize)]
pub struct RssFeedDto {
    pub id: i64,
    pub anime_id: i32,
    pub url: String,
    pub name: Option<String>,
    pub last_checked: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

impl From<crate::db::RssFeed> for RssFeedDto {
    fn from(feed: crate::db::RssFeed) -> Self {
        Self {
            id: feed.id,
            anime_id: feed.anime_id,
            url: feed.url,
            name: feed.name,
            last_checked: feed.last_checked,
            enabled: feed.enabled,
            created_at: feed.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct AddRssFeedRequest {
    pub anime_id: i32,
    pub url: String,
    pub name: Option<String>,
}

pub async fn list_feeds(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<RssFeedDto>>>, ApiError> {
    let feeds = state.store().get_enabled_rss_feeds().await?;
    let dtos: Vec<RssFeedDto> = feeds.into_iter().map(RssFeedDto::from).collect();
    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn get_feeds_for_anime(
    State(state): State<Arc<AppState>>,
    Path(anime_id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<RssFeedDto>>>, ApiError> {
    let feeds = state.store().get_rss_feeds_for_anime(anime_id).await?;
    let dtos: Vec<RssFeedDto> = feeds.into_iter().map(RssFeedDto::from).collect();
    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn add_feed(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddRssFeedRequest>,
) -> Result<Json<ApiResponse<RssFeedDto>>, ApiError> {
    let anime = state.store().get_anime(payload.anime_id).await?;
    if anime.is_none() {
        return Err(ApiError::anime_not_found(payload.anime_id));
    }

    let feed_id = state
        .store()
        .add_rss_feed(payload.anime_id, &payload.url, payload.name.as_deref())
        .await?;

    let feed = state.store().get_rss_feed(feed_id).await?;
    match feed {
        Some(f) => Ok(Json(ApiResponse::success(RssFeedDto::from(f)))),
        None => Err(ApiError::internal("Failed to create RSS feed")),
    }
}

pub async fn delete_feed(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, ApiError> {
    let deleted = state.store().remove_rss_feed(id).await?;
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
    let updated = state.store().toggle_rss_feed(id, payload.enabled).await?;
    if updated {
        Ok(Json(ApiResponse::success(true)))
    } else {
        Err(ApiError::not_found("RSS feed", id))
    }
}

#[derive(Debug, Deserialize)]
pub struct ToggleFeedRequest {
    pub enabled: bool,
}
