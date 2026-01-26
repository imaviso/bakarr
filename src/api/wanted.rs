use axum::{
    Json,
    extract::{Query, State},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};

#[derive(Debug, Serialize)]
pub struct MissingEpisodeDto {
    pub anime_id: i64,
    pub anime_title: String,
    pub episode_number: i64,
    pub episode_title: Option<String>,
    pub aired: Option<String>,
    pub anime_image: Option<String>,
}

impl From<crate::db::MissingEpisodeRow> for MissingEpisodeDto {
    fn from(row: crate::db::MissingEpisodeRow) -> Self {
        Self {
            anime_id: row.anime_id,
            anime_title: row.anime_title,
            episode_number: row.episode_number,
            episode_title: row.episode_title,
            aired: row.aired,
            anime_image: row.anime_image,
        }
    }
}

#[derive(Deserialize)]
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
    let missing = state.store().get_all_missing_episodes(query.limit).await?;

    let dtos: Vec<MissingEpisodeDto> = missing.into_iter().map(MissingEpisodeDto::from).collect();

    Ok(Json(ApiResponse::success(dtos)))
}
