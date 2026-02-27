//! Domain service for episode management operations.
//!
//! This module provides the [`EpisodeService`] trait, abstracting episode logic
//! including metadata fetching, file management, and status tracking.

use crate::api::types::{
    CalendarEventDto, EpisodeDto, MissingEpisodeDto, ScanFolderResult, VideoFileDto,
};
use crate::domain::{AnimeId, EpisodeNumber};
use thiserror::Error;

/// Domain errors for episode operations.
///
/// Implements C-GOOD-ERR: errors must be meaningful, implement `std::error::Error`,
/// Send, Sync, and Display.
#[derive(Debug, Error)]
pub enum EpisodeError {
    #[error("Anime {0} not found")]
    AnimeNotFound(AnimeId),

    #[error("Episode {0} not found")]
    NotFound(EpisodeNumber),

    #[error("Database error: {0}")]
    Database(String),

    #[error("File system error: {0}")]
    FileSystem(#[from] std::io::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("External API error: {service} - {message}")]
    ExternalApi { service: String, message: String },
}

impl From<sea_orm::DbErr> for EpisodeError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err.to_string())
    }
}

impl From<anyhow::Error> for EpisodeError {
    fn from(err: anyhow::Error) -> Self {
        Self::Database(err.to_string())
    }
}

/// Domain service trait for episode operations.
///
/// This trait abstracts episode-related business logic, enabling:
/// - Testability through mocking
/// - Separation of concerns (handlers don't touch DB directly)
/// - Clean architecture with dependency inversion
#[async_trait::async_trait]
pub trait EpisodeService: Send + Sync {
    /// Lists all episodes for an anime with their download status.
    ///
    /// # Errors
    ///
    /// - Returns [`EpisodeError::AnimeNotFound`] if anime does not exist
    /// - Returns [`EpisodeError::Database`] on connection failures
    async fn list_episodes(&self, anime_id: AnimeId) -> Result<Vec<EpisodeDto>, EpisodeError>;

    /// Gets details for a specific episode.
    ///
    /// # Errors
    ///
    /// - Returns [`EpisodeError::AnimeNotFound`] if anime does not exist
    /// - Returns [`EpisodeError::NotFound`] if episode does not exist
    /// - Returns [`EpisodeError::Database`] on connection failures
    async fn get_episode(
        &self,
        anime_id: AnimeId,
        episode_number: EpisodeNumber,
    ) -> Result<EpisodeDto, EpisodeError>;

    /// Lists missing episode numbers for an anime.
    ///
    /// # Errors
    ///
    /// - Returns [`EpisodeError::AnimeNotFound`] if anime does not exist
    /// - Returns [`EpisodeError::Database`] on connection failures
    async fn get_missing_episodes(&self, anime_id: AnimeId) -> Result<Vec<i32>, EpisodeError>;

    /// Scans the anime folder for new files and imports them.
    ///
    /// # Errors
    ///
    /// - Returns [`EpisodeError::AnimeNotFound`] if anime does not exist
    /// - Returns [`EpisodeError::Validation`] if folder path is invalid
    /// - Returns [`EpisodeError::FileSystem`] on I/O errors
    /// - Returns [`EpisodeError::Database`] on connection failures
    async fn scan_folder(&self, anime_id: AnimeId) -> Result<ScanFolderResult, EpisodeError>;

    /// Lists video files in the anime directory.
    ///
    /// # Errors
    ///
    /// - Returns [`EpisodeError::AnimeNotFound`] if anime does not exist
    /// - Returns [`EpisodeError::Validation`] if folder path is invalid
    /// - Returns [`EpisodeError::FileSystem`] on I/O errors
    /// - Returns [`EpisodeError::Database`] on connection failures
    async fn list_files(&self, anime_id: AnimeId) -> Result<Vec<VideoFileDto>, EpisodeError>;

    /// Maps a file to a specific episode.
    ///
    /// # Errors
    ///
    /// - Returns [`EpisodeError::AnimeNotFound`] if anime does not exist
    /// - Returns [`EpisodeError::NotFound`] if file does not exist
    /// - Returns [`EpisodeError::Validation`] if episode number is invalid
    /// - Returns [`EpisodeError::FileSystem`] on I/O errors
    /// - Returns [`EpisodeError::Database`] on connection failures
    async fn map_file(
        &self,
        anime_id: AnimeId,
        episode_number: EpisodeNumber,
        file_path: String,
    ) -> Result<(), EpisodeError>;

    /// Bulk maps multiple files to episodes.
    ///
    /// # Errors
    ///
    /// Errors are logged but not returned; partial success is allowed.
    async fn bulk_map_files(
        &self,
        anime_id: AnimeId,
        mappings: Vec<(EpisodeNumber, String)>,
    ) -> Result<(), EpisodeError>;

    /// Deletes the file associated with an episode (moves to recycle bin).
    ///
    /// # Errors
    ///
    /// - Returns [`EpisodeError::AnimeNotFound`] if anime does not exist
    /// - Returns [`EpisodeError::NotFound`] if episode or file does not exist
    /// - Returns [`EpisodeError::FileSystem`] on I/O errors
    /// - Returns [`EpisodeError::Database`] on connection failures
    async fn delete_file(
        &self,
        anime_id: AnimeId,
        episode_number: EpisodeNumber,
    ) -> Result<(), EpisodeError>;

    /// Refreshes metadata for an anime's episodes from external sources.
    ///
    /// # Errors
    ///
    /// - Returns [`EpisodeError::AnimeNotFound`] if anime does not exist
    /// - Returns [`EpisodeError::ExternalApi`] if fetching from external sources fails
    /// - Returns [`EpisodeError::Database`] on connection failures
    async fn refresh_metadata(&self, anime_id: AnimeId) -> Result<usize, EpisodeError>;

    /// Refreshes metadata for all active (releasing) anime.
    ///
    /// # Errors
    ///
    /// Errors for individual anime are logged; partial success is allowed.
    async fn refresh_all_active_metadata(&self) -> Result<(), EpisodeError>;

    /// Lists all missing episodes across all monitored anime.
    ///
    /// # Errors
    ///
    /// Returns [`EpisodeError::Database`] on connection failures.
    async fn list_all_missing(&self, limit: u64) -> Result<Vec<MissingEpisodeDto>, EpisodeError>;

    /// Gets calendar events for episodes within a date range.
    ///
    /// # Errors
    ///
    /// Returns [`EpisodeError::Database`] on connection failures.
    async fn get_calendar(
        &self,
        start: &str,
        end: &str,
    ) -> Result<Vec<CalendarEventDto>, EpisodeError>;

    /// Gets episode titles for multiple anime/episode pairs.
    ///
    /// Returns a map from `anime_id` and `episode_number` to title string.
    /// Falls back to "Episode {n}" for missing entries.
    ///
    /// # Errors
    ///
    /// Returns [`EpisodeError::Database`] on connection failures.
    async fn get_episode_titles_batch(
        &self,
        pairs: &[(i32, i32)],
    ) -> Result<std::collections::HashMap<(i32, i32), String>, EpisodeError>;

    /// Gets a single episode title with fallback.
    ///
    /// Returns episode title if known, otherwise falls back to `Episode {n}`.
    ///
    /// # Errors
    ///
    /// Returns [`EpisodeError::Database`] on connection failures.
    async fn get_episode_title(
        &self,
        anime_id: AnimeId,
        episode_number: EpisodeNumber,
    ) -> Result<String, EpisodeError>;
}
