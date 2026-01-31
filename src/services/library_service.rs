//! Domain service for library management operations.
//!
//! This module provides a clean domain layer abstraction over data access,
//! enabling testability and separation of concerns per Principal Rust standards.
//!
//! # Principal Notes
//! - **Separation of Concerns**: API layer only handles HTTP/JSON. Logic lives here.
//! - **N+1 Prevention**: `get_activity` fetches relations efficiently using batch queries.
//! - **Type Safety**: Uses [`AnimeId`] and strongly typed DTOs.

use crate::domain::AnimeId;
use crate::services::scanner::ScannerState;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Domain errors for library operations.
///
/// Implements C-GOOD-ERR: errors must be meaningful, implement `std::error::Error`,
/// Send, Sync, and Display.
#[derive(Debug, Error)]
pub enum LibraryError {
    #[error("Anime not found: {0}")]
    NotFound(AnimeId),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("External API error: {service} - {message}")]
    ExternalApi { service: String, message: String },
}

impl LibraryError {
    /// Creates an external API error for `AniList`.
    pub fn anilist_error(msg: impl Into<String>) -> Self {
        Self::ExternalApi {
            service: "AniList".to_string(),
            message: msg.into(),
        }
    }
}

impl From<sea_orm::DbErr> for LibraryError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err.to_string())
    }
}

impl From<anyhow::Error> for LibraryError {
    fn from(err: anyhow::Error) -> Self {
        Self::Database(err.to_string())
    }
}

/// DTO for library statistics.
///
/// # Examples
///
/// ```
/// use bakarr::services::library_service::LibraryStats;
///
/// let stats = LibraryStats {
///     total_anime: 10,
///     total_episodes: 120,
///     downloaded_episodes: 100,
///     missing_episodes: 20,
///     rss_feeds: 3,
///     recent_downloads: 5,
/// };
///
/// assert_eq!(stats.total_anime, 10);
/// ```
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LibraryStats {
    pub total_anime: i32,
    pub total_episodes: i32,
    pub downloaded_episodes: i32,
    pub missing_episodes: i32,
    pub rss_feeds: i32,
    pub recent_downloads: i32,
}

/// DTO for recent activity.
#[derive(Debug, Clone, Serialize)]
pub struct ActivityItem {
    pub id: i64,
    pub activity_type: String,
    pub anime_id: AnimeId,
    pub anime_title: String,
    pub episode_number: Option<f32>,
    pub description: String,
    pub timestamp: String,
}

/// Request DTO for importing a folder.
///
/// # Examples
///
/// ```
/// use bakarr::services::library_service::ImportFolderRequest;
/// use bakarr::domain::AnimeId;
///
/// let request = ImportFolderRequest {
///     folder_name: "My Anime".to_string(),
///     anime_id: AnimeId::new(42),
///     profile_name: Some("1080p".to_string()),
/// };
///
/// assert_eq!(request.folder_name, "My Anime");
/// ```
#[derive(Debug, Clone, Deserialize)]
pub struct ImportFolderRequest {
    pub folder_name: String,
    pub anime_id: AnimeId,
    pub profile_name: Option<String>,
}

/// Domain service trait for library operations.
///
/// This trait abstracts library-related business logic, enabling:
/// - Testability through mocking
/// - Separation of concerns (handlers don't touch DB directly)
/// - Clean architecture with dependency inversion
///
/// # Examples
///
/// ```rust,ignore
/// use bakarr::services::{LibraryService, LibraryError};
/// use std::sync::Arc;
///
/// async fn example(service: Arc<dyn LibraryService>) -> Result<(), LibraryError> {
///     let stats = service.get_stats().await?;
///     println!("Total anime: {}", stats.total_anime);
///     Ok(())
/// }
/// ```
#[async_trait::async_trait]
pub trait LibraryService: Send + Sync {
    /// Calculates aggregate statistics for the entire library.
    ///
    /// # Errors
    ///
    /// Returns [`LibraryError::Database`] on connection failures.
    async fn get_stats(&self) -> Result<LibraryStats, LibraryError>;

    /// Retrieves recent activity (downloads) with efficient relation loading.
    ///
    /// This method prevents N+1 queries by batch fetching related anime
    /// before constructing the activity items.
    ///
    /// # Errors
    ///
    /// - Returns [`LibraryError::Database`] on connection failures.
    /// - Returns [`LibraryError::NotFound`] if referenced anime is missing (should not happen with DB integrity).
    async fn get_activity(&self, limit: usize) -> Result<Vec<ActivityItem>, LibraryError>;

    /// Imports an unmapped folder into the library.
    ///
    /// This process:
    /// 1. Validates the folder existence on disk.
    /// 2. Fetches metadata from `AniList`.
    /// 3. Assigns a quality profile.
    /// 4. Adds the anime to the database.
    /// 5. Spawns background tasks to scan files and download images.
    ///
    /// # Errors
    ///
    /// - Returns [`LibraryError::NotFound`] if anime does not exist in `AniList`.
    /// - Returns [`LibraryError::Validation`] if folder doesn't exist or anime already in library.
    /// - Returns [`LibraryError::ExternalApi`] if fetching from `AniList` fails.
    /// - Returns [`LibraryError::Database`] on connection failures.
    async fn import_folder(&self, request: ImportFolderRequest) -> Result<(), LibraryError>;

    /// Returns the current state of the unmapped folder scanner.
    async fn get_unmapped_folders(&self) -> Result<ScannerState, LibraryError>;

    /// Triggers a background scan for unmapped folders.
    async fn start_unmapped_scan(&self) -> Result<(), LibraryError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::AnimeId;

    #[test]
    fn library_error_display() {
        let err = LibraryError::NotFound(AnimeId::new(42));
        assert_eq!(err.to_string(), "Anime not found: 42");

        let err = LibraryError::anilist_error("network timeout");
        assert_eq!(
            err.to_string(),
            "External API error: AniList - network timeout"
        );
    }

    #[test]
    fn library_stats_equality() {
        let stats1 = LibraryStats {
            total_anime: 10,
            total_episodes: 120,
            downloaded_episodes: 100,
            missing_episodes: 20,
            rss_feeds: 3,
            recent_downloads: 5,
        };

        let stats2 = LibraryStats {
            total_anime: 10,
            total_episodes: 120,
            downloaded_episodes: 100,
            missing_episodes: 20,
            rss_feeds: 3,
            recent_downloads: 5,
        };

        assert_eq!(stats1, stats2);
    }
}
