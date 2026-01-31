//! Library management API endpoints.
//!
//! This module provides HTTP endpoints for library operations.
//! All business logic is delegated to [`LibraryService`] to maintain
//! separation of concerns and enable testability.
//!
//! # Principal Notes
//! - **Zero Business Logic**: Handlers only handle HTTP/JSON mapping.
//! - **Strong Typing**: Uses [`AnimeId`] newtype for type safety.
//! - **Error Mapping**: Converts domain errors to HTTP responses via [`ApiError`].

use axum::{Json, extract::State};
use serde::Deserialize;
use std::sync::Arc;

use crate::api::{ApiError, ApiResponse, AppState};
use crate::services::LibraryError;
use crate::services::library_service::{ActivityItem, ImportFolderRequest, LibraryStats};
use crate::services::scanner::ScannerState;

/// Query parameters for activity feed endpoint.
#[derive(Debug, Deserialize)]
pub struct ActivityQuery {
    #[serde(default = "default_activity_limit")]
    pub limit: usize,
}

const fn default_activity_limit() -> usize {
    20
}

impl From<LibraryError> for ApiError {
    fn from(err: LibraryError) -> Self {
        match err {
            LibraryError::NotFound(id) => Self::anime_not_found(id.value()),
            LibraryError::Validation(msg) => Self::validation(msg),
            LibraryError::Database(msg) => Self::internal(msg),
            LibraryError::ExternalApi { service, message } => {
                Self::ExternalApiError { service, message }
            }
        }
    }
}

/// Returns aggregated library statistics.
///
/// # Endpoint
/// `GET /api/library/stats`
///
/// # Response
/// Returns [`LibraryStats`] with counts of anime, episodes, downloads, etc.
///
/// # Errors
/// Returns [`ApiError::Internal`] on database failures.
pub async fn get_stats(
    State(app_state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<LibraryStats>>, ApiError> {
    let library_stats = app_state.library_service().get_stats().await?;
    Ok(Json(ApiResponse::success(library_stats)))
}

/// Returns recent activity feed (downloads).
///
/// # Endpoint
/// `GET /api/library/activity`
///
/// # Query Parameters
/// - `limit`: Maximum number of items to return (default: 20)
///
/// # Response
/// Returns vector of [`ActivityItem`] representing recent downloads.
///
/// # Errors
/// Returns [`ApiError::Internal`] on database failures.
pub async fn get_activity(
    State(app_state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<ActivityQuery>,
) -> Result<Json<ApiResponse<Vec<ActivityItem>>>, ApiError> {
    let activity = app_state
        .library_service()
        .get_activity(query.limit)
        .await?;
    Ok(Json(ApiResponse::success(activity)))
}

/// Returns list of unmapped folders found by scanner.
///
/// # Endpoint
/// `GET /api/library/unmapped`
///
/// # Response
/// Returns [`ScannerState`] containing scan status and found folders.
pub async fn get_unmapped_folders(
    State(app_state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<ScannerState>>, ApiError> {
    let folders = app_state.library_service().get_unmapped_folders().await?;
    Ok(Json(ApiResponse::success(folders)))
}

/// Triggers a scan for unmapped folders.
///
/// # Endpoint
/// `POST /api/library/unmapped/scan`
///
/// This endpoint starts a background scan that identifies folders
/// in the library path that don't have corresponding anime entries.
///
/// # Response
/// Returns empty success response immediately. Progress events
/// are sent via the event bus.
pub async fn scan_library(
    State(app_state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    app_state.library_service().start_unmapped_scan().await?;
    Ok(Json(ApiResponse::success(())))
}

/// Imports an unmapped folder as a specific anime.
///
/// # Endpoint
/// `POST /api/library/unmapped/import`
///
/// # Request Body
/// - `folder_name`: Name of the folder to import (relative to library path)
/// - `anime_id`: `AniList` ID of the anime
/// - `profile_name`: Optional quality profile name (uses default if not specified)
///
/// # Process
/// 1. Validates folder exists on disk
/// 2. Fetches metadata from `AniList`
/// 3. Assigns quality profile
/// 4. Adds anime to database
/// 5. Spawns background tasks for file scanning and image downloads
///
/// # Errors
/// - Returns [`ApiError::Validation`] if folder doesn't exist or anime already exists
/// - Returns [`ApiError::NotFound`] if anime not found in `AniList`
/// - Returns [`ApiError::External`] if `AniList` API fails
pub async fn import_folder(
    State(app_state): State<Arc<AppState>>,
    Json(request): Json<ImportFolderRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    app_state.library_service().import_folder(request).await?;
    Ok(Json(ApiResponse::success(())))
}
