use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
use crate::db::repositories::release_profile::ReleaseProfileRuleDto;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseProfileDto {
    pub id: i32,
    pub name: String,
    pub enabled: bool,
    pub rules: Vec<ReleaseProfileRuleDtoPublic>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseProfileRuleDtoPublic {
    pub term: String,
    pub score: i32,
    pub rule_type: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateReleaseProfileRequest {
    pub name: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    pub rules: Vec<ReleaseProfileRuleDtoPublic>,
}

const fn default_enabled() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct UpdateReleaseProfileRequest {
    pub name: String,
    pub enabled: bool,
    pub rules: Vec<ReleaseProfileRuleDtoPublic>,
}

pub async fn list_release_profiles(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<ReleaseProfileDto>>>, ApiError> {
    let profiles = state
        .shared
        .store
        .list_release_profiles()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let dtos = profiles
        .into_iter()
        .map(|(p, rules)| ReleaseProfileDto {
            id: p.id,
            name: p.name,
            enabled: p.enabled,
            rules: rules
                .into_iter()
                .map(|r| ReleaseProfileRuleDtoPublic {
                    term: r.term,
                    score: r.score,
                    rule_type: r.rule_type,
                })
                .collect(),
        })
        .collect();

    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn create_release_profile(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateReleaseProfileRequest>,
) -> Result<Json<ApiResponse<ReleaseProfileDto>>, ApiError> {
    let rules: Vec<ReleaseProfileRuleDto> = payload
        .rules
        .into_iter()
        .map(|r| ReleaseProfileRuleDto {
            term: r.term,
            score: r.score,
            rule_type: r.rule_type,
        })
        .collect();

    let profile = state
        .shared
        .store
        .create_release_profile(payload.name, payload.enabled, rules)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let all = state
        .shared
        .store
        .list_release_profiles()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let (p, r) = all
        .into_iter()
        .find(|(p, _)| p.id == profile.id)
        .ok_or_else(|| ApiError::internal("Failed to fetch created profile".to_string()))?;

    let dto = ReleaseProfileDto {
        id: p.id,
        name: p.name,
        enabled: p.enabled,
        rules: r
            .into_iter()
            .map(|rule| ReleaseProfileRuleDtoPublic {
                term: rule.term,
                score: rule.score,
                rule_type: rule.rule_type,
            })
            .collect(),
    };

    Ok(Json(ApiResponse::success(dto)))
}

pub async fn update_release_profile(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateReleaseProfileRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let rules: Vec<ReleaseProfileRuleDto> = payload
        .rules
        .into_iter()
        .map(|r| ReleaseProfileRuleDto {
            term: r.term,
            score: r.score,
            rule_type: r.rule_type,
        })
        .collect();

    state
        .shared
        .store
        .update_release_profile(id, payload.name, payload.enabled, rules)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(())))
}

pub async fn delete_release_profile(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    state
        .shared
        .store
        .delete_release_profile(id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(())))
}
