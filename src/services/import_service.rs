//! Domain service for manual file import operations.
//!
//! This module provides a clean domain layer abstraction for importing files
//! from arbitrary paths into the library, handling scanning, matching, and
//! execution with proper side effects.

use crate::api::types::SearchResultDto;
use crate::domain::AnimeId;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Errors specific to the import process.
#[derive(Debug, Error)]
pub enum ImportError {
    #[error("Path not found: {0}")]
    PathNotFound(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Anime not found: {0}")]
    AnimeNotFound(AnimeId),

    #[error("Database error: {0}")]
    Database(#[from] sea_orm::DbErr),

    #[error("External API error: {service} - {message}")]
    ExternalApi { service: String, message: String },

    #[error("Internal error: {0}")]
    Internal(String),
}

impl ImportError {
    /// Creates an external API error for `AniList`.
    pub fn anilist_error(msg: impl Into<String>) -> Self {
        Self::ExternalApi {
            service: "AniList".to_string(),
            message: msg.into(),
        }
    }
}

impl From<anyhow::Error> for ImportError {
    fn from(err: anyhow::Error) -> Self {
        Self::Internal(err.to_string())
    }
}

/// DTO for a file found during scanning.
#[derive(Debug, Clone, Serialize)]
pub struct ScannedFileDto {
    pub source_path: String,
    pub filename: String,
    pub parsed_title: String,
    pub episode_number: f32,
    pub season: Option<i32>,
    pub group: Option<String>,
    pub resolution: Option<String>,
    pub matched_anime: Option<MatchedAnimeDto>,
    pub suggested_candidate_id: Option<i32>,
}

/// DTO for matched anime during scanning.
#[derive(Debug, Clone, Serialize)]
pub struct MatchedAnimeDto {
    pub id: i32,
    pub title: String,
}

/// DTO for import operation result.
#[derive(Debug, Serialize, Default)]
pub struct ImportOperationResult {
    pub imported: usize,
    pub failed: usize,
    pub imported_files: Vec<ImportedFileDto>,
    pub failed_files: Vec<FailedImportDto>,
}

/// DTO for successfully imported file.
#[derive(Debug, Clone, Serialize)]
pub struct ImportedFileDto {
    pub source_path: String,
    pub destination_path: String,
    pub anime_id: i32,
    pub episode_number: i32,
}

/// DTO for failed import.
#[derive(Debug, Clone, Serialize)]
pub struct FailedImportDto {
    pub source_path: String,
    pub error: String,
}

/// DTO for scan results.
#[derive(Debug, Serialize)]
pub struct ScanResultDto {
    pub files: Vec<ScannedFileDto>,
    pub skipped: Vec<SkippedFileDto>,
    pub candidates: Vec<SearchResultDto>,
}

/// DTO for skipped files.
#[derive(Debug, Clone, Serialize)]
pub struct SkippedFileDto {
    pub path: String,
    pub reason: String,
}

/// Request DTO for importing a single file.
#[derive(Debug, Clone, Deserialize)]
pub struct ImportFileRequestDto {
    pub source_path: String,
    pub anime_id: i32,
    pub episode_number: i32,
    pub season: Option<i32>,
}

/// Domain service trait for import operations.
///
/// This trait abstracts manual import functionality, enabling:
/// - Testability through mocking
/// - Separation of concerns (handlers don't touch FS/DB directly)
/// - Clean architecture with dependency inversion
#[async_trait::async_trait]
pub trait ImportService: Send + Sync {
    /// Scans a directory path for video files and suggests anime matches.
    ///
    /// This method offloads filesystem traversal to a blocking thread
    /// to avoid stalling the async runtime.
    ///
    /// # Arguments
    ///
    /// * `path` - The directory or file path to scan
    /// * `target_anime_id` - Optional specific anime to match against
    ///
    /// # Returns
    ///
    /// Returns `Ok(ScanResultDto)` containing scanned files and suggested candidates.
    ///
    /// # Errors
    ///
    /// - Returns `ImportError::PathNotFound` if path doesn't exist
    /// - Returns `ImportError::Internal` on filesystem errors
    async fn scan_path(
        &self,
        path: String,
        target_anime_id: Option<AnimeId>,
    ) -> Result<ScanResultDto, ImportError>;

    /// Imports a specific file into the library.
    ///
    /// Handles the complete import workflow:
    /// 1. Validates source file exists
    /// 2. Resolves anime (fetching from `AniList` if needed)
    /// 3. Determines episode title and quality
    /// 4. Generates destination path via `LibraryService`
    /// 5. Performs file operation (move/copy/hardlink)
    /// 6. Records in database
    ///
    /// # Arguments
    ///
    /// * `request` - The import file request DTO
    ///
    /// # Returns
    ///
    /// Returns `Ok(ImportedFileDto)` with import details.
    ///
    /// # Errors
    ///
    /// - Returns `ImportError::PathNotFound` if source doesn't exist
    /// - Returns `ImportError::AnimeNotFound` if `anime_id` invalid
    /// - Returns `ImportError::Database` on DB failures
    async fn import_file(
        &self,
        request: ImportFileRequestDto,
    ) -> Result<ImportedFileDto, ImportError>;

    /// Imports multiple files in batch.
    ///
    /// Iterates through requests, importing each individually.
    /// Continues on individual failures, collecting results.
    ///
    /// # Arguments
    ///
    /// * `requests` - Vector of import file requests
    ///
    /// # Returns
    ///
    /// Returns `ImportOperationResult` with success/failure counts and details.
    async fn import_files(&self, requests: Vec<ImportFileRequestDto>) -> ImportOperationResult;
}
