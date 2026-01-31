use axum::{
    Json,
    extract::{Query, State},
};
use std::sync::Arc;

use crate::api::{ApiError, ApiResponse, AppState};
pub use crate::api::types::CalendarEventDto;

#[derive(serde::Deserialize)]
pub struct CalendarQuery {
    pub start: String,
    pub end: String,
}

pub async fn get_calendar(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CalendarQuery>,
) -> Result<Json<ApiResponse<Vec<CalendarEventDto>>>, ApiError> {
    let dtos = state
        .episode_service()
        .get_calendar(&query.start, &query.end)
        .await?;

    Ok(Json(ApiResponse::success(dtos)))
}
