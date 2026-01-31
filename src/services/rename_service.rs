//! Domain service for file renaming and organization.
//!
//! Handles previewing proposed renames and executing them with database
//! synchronization and rollback support.

use crate::domain::{AnimeId, EpisodeNumber};
use serde::Serialize;
use thiserror::Error;

/// Errors specific to the renaming process.
#[derive(Debug, Error)]
pub enum RenameError {
    #[error("Anime not found: {0}")]
    AnimeNotFound(AnimeId),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("File system error: {0}")]
    FileSystem(String),

    #[error("Critical error: {0}")]
    Critical(String),
}

impl From<sea_orm::DbErr> for RenameError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err.to_string())
    }
}

impl From<anyhow::Error> for RenameError {
    fn from(err: anyhow::Error) -> Self {
        Self::Critical(err.to_string())
    }
}

/// proposed rename operation for a single episode.
#[derive(Debug, Serialize, Clone)]
pub struct RenamePreviewItem {
    pub episode_number: EpisodeNumber,
    pub current_path: String,
    pub new_path: String,
    pub new_filename: String,
}

/// Result of a bulk rename operation.
#[derive(Debug, Serialize, Default)]
pub struct RenameResult {
    pub renamed: i32,
    pub failed: i32,
    pub failures: Vec<String>,
}

/// Domain service trait for renaming operations.
///
/// This trait abstracts the complexity of analyzing media files,
/// calculating target paths based on renaming patterns, and safely
/// executing renames with database updates.
#[async_trait::async_trait]
pub trait RenameService: Send + Sync {
    /// Generates a list of proposed renames for an anime's episodes.
    ///
    /// Analyzes all downloaded episodes for the given anime and calculates
    /// their ideal paths based on the current renaming configuration.
    /// Files that already match their ideal path are excluded from the preview.
    ///
    /// # Arguments
    ///
    /// * `anime_id` - The unique identifier of the anime
    ///
    /// # Errors
    ///
    /// Returns [`RenameError::AnimeNotFound`] if the anime doesn't exist.
    async fn get_preview(&self, anime_id: AnimeId) -> Result<Vec<RenamePreviewItem>, RenameError>;

    /// Executes renames for all episodes of an anime.
    ///
    /// Performs the following for each episode that needs renaming:
    /// 1. Calculates target path.
    /// 2. Creates parent directories if needed.
    /// 3. Renames the file on disk.
    /// 4. Updates the database with the new path.
    /// 5. Attempts rollback (file move back) if database update fails.
    ///
    /// # Arguments
    ///
    /// * `anime_id` - The unique identifier of the anime
    ///
    /// # Errors
    ///
    /// Returns [`RenameError::AnimeNotFound`] if the anime doesn't exist.
    /// Individual episode failures are collected in the [`RenameResult`].
    async fn execute_rename(&self, anime_id: AnimeId) -> Result<RenameResult, RenameError>;
}
