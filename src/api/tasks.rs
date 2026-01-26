use axum::{Json, extract::State};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};

pub async fn trigger_scan(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<String>>, ApiError> {
    tokio::spawn(async move {
        if let Err(e) = state.library_scanner.scan_library_files().await {
            tracing::error!("Library scan failed: {}", e);
        }
    });

    Ok(Json(ApiResponse::success("Scan started".to_string())))
}

pub async fn trigger_rss_check(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<String>>, ApiError> {
    tokio::spawn(async move {
        let delay = u64::from(state.config().read().await.scheduler.check_delay_seconds);
        if let Err(e) = state.rss_service.check_feeds(delay).await {
            tracing::error!("RSS check failed: {}", e);
        }
    });

    Ok(Json(ApiResponse::success("RSS check started".to_string())))
}
