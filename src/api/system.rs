//! System API endpoints.
//!
//! This module provides HTTP endpoints for system-level operations including
//! status monitoring, configuration management, and log access.
//! All business logic is delegated to [`SystemService`] to maintain
//! separation of concerns and enable testability.

use axum::{Json, extract::State};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
use crate::config::Config;
use crate::services::system_service::SystemError;

pub mod logs;
pub use logs::{clear_logs, get_logs};

impl From<SystemError> for ApiError {
    fn from(err: SystemError) -> Self {
        match err {
            SystemError::Config(msg) | SystemError::Validation(msg) => Self::validation(msg),
            SystemError::Database(msg) | SystemError::Internal(msg) => Self::internal(msg),
            SystemError::ExternalService { service, message } => {
                Self::ExternalApiError { service, message }
            }
        }
    }
}

/// Returns comprehensive system status.
///
/// # Endpoint
/// `GET /api/system/status`
///
/// Aggregates data from multiple sources including anime counts,
/// episode statistics, torrent status, and disk space.
pub async fn get_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<super::SystemStatus>>, ApiError> {
    let status = state
        .system_service()
        .get_status(
            state.start_time.elapsed().as_secs(),
            env!("CARGO_PKG_VERSION"),
        )
        .await?;

    Ok(Json(ApiResponse::success(status)))
}

/// Returns the current system configuration with sensitive data masked.
///
/// # Endpoint
/// `GET /api/system/config`
///
/// Passwords are replaced with mask strings for security.
pub async fn get_config(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Config>>, ApiError> {
    let config = state.system_service().get_config().await?;
    Ok(Json(ApiResponse::success(config)))
}

/// Updates the system configuration.
///
/// # Endpoint
/// `PUT /api/system/config`
///
/// Handles password masking - if the request contains mask strings,
/// existing passwords are preserved.
pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(new_config): Json<Config>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    const MASK: &str = "********";
    state
        .system_service()
        .update_config(new_config, MASK)
        .await?;
    Ok(Json(ApiResponse::success(())))
}
