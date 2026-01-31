use axum::{
    Json,
    extract::{Path, State},
};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState, ProfileDto, QualityDto};
use crate::api::validation::validate_profile_name;

pub async fn list_qualities(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<QualityDto>>>, ApiError> {
    let qualities = state
        .profile_service()
        .list_qualities()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(qualities)))
}

pub async fn list_profiles(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<ProfileDto>>>, ApiError> {
    let profiles = state
        .profile_service()
        .list_quality_profiles()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(profiles)))
}

pub async fn get_profile(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<ApiResponse<ProfileDto>>, ApiError> {
    validate_profile_name(&name)?;

    let profile = state
        .profile_service()
        .get_quality_profile(&name)
        .await
        .map_err(|e| match e {
            crate::services::profile_service::ProfileError::NotFound(_) => {
                ApiError::profile_not_found(&name)
            }
            _ => ApiError::internal(e.to_string()),
        })?;

    Ok(Json(ApiResponse::success(profile)))
}

pub async fn create_profile(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ProfileDto>,
) -> Result<Json<ApiResponse<ProfileDto>>, ApiError> {
    validate_profile_name(&payload.name)?;

    let profile = state
        .profile_service()
        .create_quality_profile(payload)
        .await
        .map_err(|e| match e {
            crate::services::profile_service::ProfileError::Validation(msg) => {
                ApiError::validation(msg)
            }
            crate::services::profile_service::ProfileError::Conflict(msg) => {
                ApiError::Conflict(msg)
            }
            _ => ApiError::internal(e.to_string()),
        })?;

    Ok(Json(ApiResponse::success(profile)))
}

pub async fn update_profile(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(payload): Json<ProfileDto>,
) -> Result<Json<ApiResponse<ProfileDto>>, ApiError> {
    let profile = state
        .profile_service()
        .update_quality_profile(&name, payload)
        .await
        .map_err(|e| match e {
            crate::services::profile_service::ProfileError::Validation(msg) => {
                ApiError::validation(msg)
            }
            crate::services::profile_service::ProfileError::NotFound(_) => {
                ApiError::profile_not_found(&name)
            }
            _ => ApiError::internal(e.to_string()),
        })?;

    Ok(Json(ApiResponse::success(profile)))
}

pub async fn delete_profile(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    state
        .profile_service()
        .delete_quality_profile(&name)
        .await
        .map_err(|e| match e {
            crate::services::profile_service::ProfileError::Validation(msg) => {
                ApiError::validation(msg)
            }
            _ => ApiError::internal(e.to_string()),
        })?;

    Ok(Json(ApiResponse::success(())))
}
