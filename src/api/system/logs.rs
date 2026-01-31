//! System logs API endpoints.
//!
//! This module provides HTTP endpoints for log retrieval and export.
//! All business logic is delegated to [`SystemService`].

use axum::{
    Json,
    extract::{Query, State},
    http::header,
    response::IntoResponse,
};
use serde::Deserialize;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
use crate::api::types::LogResponse;
use crate::services::system_service::ExportFormat;

#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    #[serde(default = "default_page")]
    pub page: u64,
    #[serde(default = "default_page_size")]
    pub page_size: u64,
    pub level: Option<String>,
    pub event_type: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    #[serde(default)]
    pub format: ExportFormatParam,
}

#[derive(Debug, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormatParam {
    #[default]
    Json,
    Csv,
}

impl From<ExportFormatParam> for ExportFormat {
    fn from(param: ExportFormatParam) -> Self {
        match param {
            ExportFormatParam::Json => Self::Json,
            ExportFormatParam::Csv => Self::Csv,
        }
    }
}

const fn default_page() -> u64 {
    1
}

const fn default_page_size() -> u64 {
    50
}

/// Retrieves paginated system logs.
///
/// # Endpoint
/// `GET /api/system/logs`
///
/// Supports filtering by level, event type, and date range.
pub async fn get_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LogsQuery>,
) -> Result<Json<ApiResponse<LogResponse>>, ApiError> {
    let response = state
        .system_service()
        .get_logs(
            query.page,
            query.page_size,
            query.level,
            query.event_type,
            query.start_date,
            query.end_date,
        )
        .await?;

    Ok(Json(ApiResponse::success(response)))
}

/// Exports system logs in JSON or CSV format.
///
/// # Endpoint
/// `GET /api/system/logs/export`
///
/// Returns a downloadable file with all matching logs.
pub async fn export_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LogsQuery>,
) -> Result<axum::response::Response, ApiError> {
    let (format, content) = state
        .system_service()
        .export_logs(
            query.format.into(),
            query.level,
            query.event_type,
            query.start_date,
            query.end_date,
        )
        .await?;

    let (content_type, filename) = match format {
        ExportFormat::Csv => ("text/csv", "system_logs.csv"),
        ExportFormat::Json => ("application/json", "system_logs.json"),
    };

    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\"").as_str(),
            ),
        ],
        content,
    )
        .into_response())
}

/// Clears all system logs.
///
/// # Endpoint
/// `DELETE /api/system/logs`
pub async fn clear_logs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<bool>>, ApiError> {
    let cleared = state.system_service().clear_logs().await?;
    Ok(Json(ApiResponse::success(cleared)))
}
