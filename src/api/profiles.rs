use axum::{
    Json,
    extract::{Path, State},
};
use std::sync::Arc;
use tracing::error;

use super::{ApiError, ApiResponse, AppState, ProfileDto, QualityDto};
use crate::api::validation::validate_profile_name;

pub async fn list_qualities() -> Result<Json<ApiResponse<Vec<QualityDto>>>, ApiError> {
    let qualities = crate::quality::QUALITIES
        .iter()
        .filter(|q| q.id != 99) // Exclude Unknown
        .map(|q| QualityDto {
            id: q.id,
            name: q.name.clone(),
            source: q.source.as_str().to_string(),
            resolution: q.resolution,
            rank: q.rank,
        })
        .collect();

    Ok(Json(ApiResponse::success(qualities)))
}

pub async fn list_profiles(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<ProfileDto>>>, ApiError> {
    let config = state.config().read().await;
    let profiles: Vec<ProfileDto> = config
        .profiles
        .iter()
        .map(|p| ProfileDto {
            name: p.name.clone(),
            cutoff: p.cutoff.clone(),
            upgrade_allowed: p.upgrade_allowed,
            seadex_preferred: p.seadex_preferred,
            allowed_qualities: p.allowed_qualities.clone(),
        })
        .collect();

    Ok(Json(ApiResponse::success(profiles)))
}

pub async fn get_profile(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<ApiResponse<ProfileDto>>, ApiError> {
    validate_profile_name(&name)?;
    let config = state.config().read().await;
    let profile = config
        .find_profile(&name)
        .ok_or_else(|| ApiError::profile_not_found(&name))?;

    let dto = ProfileDto {
        name: profile.name.clone(),
        cutoff: profile.cutoff.clone(),
        upgrade_allowed: profile.upgrade_allowed,
        seadex_preferred: profile.seadex_preferred,
        allowed_qualities: profile.allowed_qualities.clone(),
    };

    Ok(Json(ApiResponse::success(dto)))
}

pub async fn create_profile(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ProfileDto>,
) -> Result<Json<ApiResponse<ProfileDto>>, ApiError> {
    validate_profile_name(&payload.name)?;

    if crate::quality::definition::get_quality_by_name(&payload.cutoff).is_none() {
        return Err(ApiError::validation(format!(
            "Invalid cutoff quality: {}",
            payload.cutoff
        )));
    }
    for q in &payload.allowed_qualities {
        if crate::quality::definition::get_quality_by_name(q).is_none() {
            return Err(ApiError::validation(format!("Invalid quality: {}", q)));
        }
    }

    let mut config = state.config().write().await;

    let profile = crate::config::QualityProfileConfig {
        name: payload.name.clone(),
        cutoff: payload.cutoff.clone(),
        upgrade_allowed: payload.upgrade_allowed,
        seadex_preferred: payload.seadex_preferred,
        allowed_qualities: payload.allowed_qualities.clone(),
    };

    config
        .add_profile(profile)
        .map_err(|e| ApiError::Conflict(e.to_string()))?;

    if let Err(e) = state.shared.store.sync_profiles(&config.profiles).await {
        error!("Failed to sync profiles to DB: {}", e);
    }

    Ok(Json(ApiResponse::success(payload)))
}

pub async fn update_profile(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(payload): Json<ProfileDto>,
) -> Result<Json<ApiResponse<ProfileDto>>, ApiError> {
    if crate::quality::definition::get_quality_by_name(&payload.cutoff).is_none() {
        return Err(ApiError::validation(format!(
            "Invalid cutoff quality: {}",
            payload.cutoff
        )));
    }
    for q in &payload.allowed_qualities {
        if crate::quality::definition::get_quality_by_name(q).is_none() {
            return Err(ApiError::validation(format!("Invalid quality: {}", q)));
        }
    }

    let mut config = state.config().write().await;

    let profile = crate::config::QualityProfileConfig {
        name: payload.name.clone(),
        cutoff: payload.cutoff.clone(),
        upgrade_allowed: payload.upgrade_allowed,
        seadex_preferred: payload.seadex_preferred,
        allowed_qualities: payload.allowed_qualities.clone(),
    };

    config
        .update_profile(&name, profile)
        .map_err(|e| ApiError::internal(e.to_string()))?;

    if let Err(e) = state.shared.store.sync_profiles(&config.profiles).await {
        error!("Failed to sync profiles to DB: {}", e);
    }

    Ok(Json(ApiResponse::success(payload)))
}

pub async fn delete_profile(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let mut config = state.config().write().await;

    config
        .delete_profile(&name)
        .map_err(|e| ApiError::validation(e.to_string()))?;

    Ok(Json(ApiResponse::success(())))
}
