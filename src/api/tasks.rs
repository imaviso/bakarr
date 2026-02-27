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
    let delay_secs = u64::from(state.config().read().await.scheduler.check_delay_seconds);
    state.rss_service.trigger_check(delay_secs);
    Ok(Json(ApiResponse::success("RSS check started".to_string())))
}
