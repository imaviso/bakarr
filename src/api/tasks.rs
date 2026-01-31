use axum::{Json, extract::State};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};

pub async fn trigger_scan(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<String>>, ApiError> {
    state.library_scanner.trigger_library_scan();
    Ok(Json(ApiResponse::success("Scan started".to_string())))
}

pub async fn trigger_rss_check(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<String>>, ApiError> {
    state.rss_service.trigger_check();
    Ok(Json(ApiResponse::success("RSS check started".to_string())))
}
