use crate::api::validation::validate_anime_id;
use crate::domain::AnimeId;
use axum::{
    Json,
    extract::{Path, State},
};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
pub use crate::services::rename_service::{RenamePreviewItem, RenameResult};

/// Generates a list of proposed renames for an anime's episodes.
///
/// Delegates to `RenameService::get_preview` which handles:
/// - Parallel file analysis and media info backfilling
/// - Path calculation based on configured patterns
/// - Filtering of files that already match their target path
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `500 Internal Server Error` on database or filesystem failures
pub async fn get_rename_preview(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<RenamePreviewItem>>>, ApiError> {
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    let preview = state
        .rename_service()
        .get_preview(anime_id)
        .await
        .map_err(|e| match e {
            crate::services::rename_service::RenameError::AnimeNotFound(_) => {
                ApiError::anime_not_found(id)
            }
            _ => ApiError::internal(format!("Failed to get rename preview: {e}")),
        })?;

    Ok(Json(ApiResponse::success(preview)))
}

/// Executes renames for all episodes of an anime.
///
/// Delegates to `RenameService::execute_rename` which handles:
/// - Transactional rename operations (with rollback support)
/// - Database synchronization
/// - Progress notifications via `EventBus`
///
/// # Errors
///
/// - Returns `404 Not Found` if the anime does not exist
/// - Returns `500 Internal Server Error` on database or filesystem failures
pub async fn execute_rename(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<RenameResult>>, ApiError> {
    validate_anime_id(id)?;
    let anime_id = AnimeId::new(id);

    let result = state
        .rename_service()
        .execute_rename(anime_id)
        .await
        .map_err(|e| match e {
            crate::services::rename_service::RenameError::AnimeNotFound(_) => {
                ApiError::anime_not_found(id)
            }
            _ => ApiError::internal(format!("Failed to execute rename: {e}")),
        })?;

    Ok(Json(ApiResponse::success(result)))
}
