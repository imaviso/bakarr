//! System API endpoints.
//!
//! This module provides HTTP endpoints for system-level operations including
//! status monitoring, configuration management, and log access.
//! All business logic is delegated to [`SystemService`] to maintain
//! separation of concerns and enable testability.

use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
use crate::config::Config;
use crate::services::system_service::SystemError;

pub mod logs;
pub use logs::{clear_logs, get_logs};

#[derive(Debug, Serialize)]
pub struct HealthLiveResponse {
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
pub struct HealthReadinessChecks {
    pub database: bool,
    pub qbittorrent: bool,
}

#[derive(Debug, Serialize)]
pub struct HealthReadyResponse {
    pub ready: bool,
    pub checks: HealthReadinessChecks,
}

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

/// `GET /api/system/health/live`
///
/// Lightweight liveness probe to indicate the API process is running.
pub async fn health_live() -> impl IntoResponse {
    Json(ApiResponse::success(HealthLiveResponse { status: "alive" }))
}

/// `GET /api/system/health/ready`
///
/// Readiness probe that checks database connectivity and qBittorrent availability.
pub async fn health_ready(State(state): State<Arc<AppState>>) -> Response {
    let db_ready = state.store().ping().await.is_ok();

    let qbit_enabled = {
        let config = state.config().read().await;
        config.qbittorrent.enabled
    };

    let qbit_ready = if qbit_enabled {
        if let Some(qbit) = state.qbit() {
            qbit.is_available().await
        } else {
            false
        }
    } else {
        true
    };

    let ready = db_ready && qbit_ready;
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status,
        Json(ApiResponse::success(HealthReadyResponse {
            ready,
            checks: HealthReadinessChecks {
                database: db_ready,
                qbittorrent: qbit_ready,
            },
        })),
    )
        .into_response()
}
