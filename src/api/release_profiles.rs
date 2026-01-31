use axum::{
    Json,
    extract::{Path, State},
};
use serde::Deserialize;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
pub use crate::services::profile_service::{ReleaseProfileDto, ReleaseProfileRuleDtoPublic};

#[derive(Debug, Deserialize)]
pub struct CreateReleaseProfileRequest {
    pub name: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_is_global")]
    pub is_global: bool,
    pub rules: Vec<ReleaseProfileRuleDtoPublic>,
}

const fn default_enabled() -> bool {
    true
}

const fn default_is_global() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct UpdateReleaseProfileRequest {
    pub name: String,
    pub enabled: bool,
    pub is_global: bool,
    pub rules: Vec<ReleaseProfileRuleDtoPublic>,
}

pub async fn list_release_profiles(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<ReleaseProfileDto>>>, ApiError> {
    let profiles = state
        .profile_service()
        .list_release_profiles()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(profiles)))
}

pub async fn create_release_profile(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateReleaseProfileRequest>,
) -> Result<Json<ApiResponse<ReleaseProfileDto>>, ApiError> {
    let profile = state
        .profile_service()
        .create_release_profile(
            payload.name,
            payload.enabled,
            payload.is_global,
            payload.rules,
        )
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(profile)))
}

pub async fn update_release_profile(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateReleaseProfileRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    state
        .profile_service()
        .update_release_profile(
            id,
            payload.name,
            payload.enabled,
            payload.is_global,
            payload.rules,
        )
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(())))
}

pub async fn delete_release_profile(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    state
        .profile_service()
        .delete_release_profile(id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(())))
}
