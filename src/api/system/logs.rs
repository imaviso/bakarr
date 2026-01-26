use axum::{
    Json,
    extract::{Query, State},
    http::header,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::fmt::Write;
use std::sync::Arc;

use crate::api::{ApiError, ApiResponse, AppState};
use crate::db::SystemLog;

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
    pub format: ExportFormat,
}

#[derive(Debug, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    #[default]
    Json,
    Csv,
}

const fn default_page() -> u64 {
    1
}

const fn default_page_size() -> u64 {
    50
}

#[derive(Debug, Serialize)]
pub struct LogResponse {
    pub logs: Vec<LogDto>,
    pub total_pages: u64,
}

#[derive(Debug, Serialize)]
pub struct LogDto {
    pub id: i64,
    pub event_type: String,
    pub level: String,
    pub message: String,
    pub details: Option<String>,
    pub created_at: String,
}

impl From<SystemLog> for LogDto {
    fn from(model: SystemLog) -> Self {
        Self {
            id: model.id,
            event_type: model.event_type,
            level: model.level,
            message: model.message,
            details: model.details,
            created_at: model.created_at,
        }
    }
}

pub async fn get_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LogsQuery>,
) -> Result<Json<ApiResponse<LogResponse>>, ApiError> {
    let (logs, total_pages) = state
        .store()
        .get_logs(
            query.page,
            query.page_size,
            query.level,
            query.event_type,
            query.start_date,
            query.end_date,
        )
        .await?;

    let dtos: Vec<LogDto> = logs.into_iter().map(LogDto::from).collect();

    Ok(Json(ApiResponse::success(LogResponse {
        logs: dtos,
        total_pages,
    })))
}

pub async fn export_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LogsQuery>,
) -> Result<axum::response::Response, ApiError> {
    let logs = state
        .store()
        .get_all_logs(
            query.level,
            query.event_type,
            query.start_date,
            query.end_date,
        )
        .await?;

    let dtos: Vec<LogDto> = logs.into_iter().map(LogDto::from).collect();

    if query.format == ExportFormat::Csv {
        let mut csv = String::from("id,created_at,level,event_type,message,details\n");
        for log in dtos {
            let _ = writeln!(
                csv,
                "{},{},{},{},\"{}\",\"{}\"",
                log.id,
                log.created_at,
                log.level,
                log.event_type,
                log.message.replace('"', "\"\""),
                log.details.unwrap_or_default().replace('"', "\"\"")
            );
        }

        return Ok((
            [
                (header::CONTENT_TYPE, "text/csv"),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"system_logs.csv\"",
                ),
            ],
            csv,
        )
            .into_response());
    }

    let json =
        serde_json::to_string_pretty(&dtos).map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        [
            (header::CONTENT_TYPE, "application/json"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"system_logs.json\"",
            ),
        ],
        json,
    )
        .into_response())
}

pub async fn clear_logs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<bool>>, ApiError> {
    state.store().clear_logs().await?;
    Ok(Json(ApiResponse::success(true)))
}
