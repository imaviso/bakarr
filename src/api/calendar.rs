use axum::{
    Json,
    extract::{Query, State},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::{ApiError, ApiResponse, AppState};

#[derive(Debug, Deserialize)]
pub struct CalendarQuery {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Serialize)]
pub struct CalendarEventDto {
    pub id: String,
    pub title: String,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub extended_props: CalendarEventProps,
}

#[derive(Debug, Serialize)]
pub struct CalendarEventProps {
    pub anime_id: i32,
    pub anime_title: String,
    pub episode_number: i32,
    pub downloaded: bool,
    pub anime_image: Option<String>,
}

pub async fn get_calendar(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CalendarQuery>,
) -> Result<Json<ApiResponse<Vec<CalendarEventDto>>>, ApiError> {
    let events = state
        .store()
        .get_calendar_events(&query.start, &query.end)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let dtos: Vec<CalendarEventDto> = events
        .into_iter()
        .map(|e| {
            let ep_num = e.episode_number;
            let anime_id = e.anime_id;

            let title = e.episode_title.as_ref().map_or_else(
                || format!("Episode {ep_num}"),
                |t| format!("{ep_num} - {t}"),
            );

            let date = e.aired.unwrap_or_default();

            CalendarEventDto {
                id: format!("{anime_id}-{ep_num}"),
                title,
                start: date.clone(),
                end: date,
                all_day: true,
                extended_props: CalendarEventProps {
                    anime_id: i32::try_from(anime_id).unwrap_or_default(),
                    anime_title: e.anime_title,
                    episode_number: i32::try_from(ep_num).unwrap_or_default(),
                    downloaded: e.downloaded,
                    anime_image: e.anime_image.map(|p| format!("/images/{p}")),
                },
            }
        })
        .collect();

    Ok(Json(ApiResponse::success(dtos)))
}
