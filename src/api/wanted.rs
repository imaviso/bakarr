use axum::{
    Json,
    extract::{Query, State},
};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
pub use crate::api::types::MissingEpisodeDto;

#[derive(serde::Deserialize)]
pub struct WantedQuery {
    #[serde(default = "default_limit")]
    pub limit: u64,
}

const fn default_limit() -> u64 {
    100
}

pub async fn list_missing(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WantedQuery>,
) -> Result<Json<ApiResponse<Vec<MissingEpisodeDto>>>, ApiError> {
    let dtos = state
        .episode_service()
        .list_all_missing(query.limit)
        .await?;

    Ok(Json(ApiResponse::success(dtos)))
}
