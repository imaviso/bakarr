//! Domain service for download management operations.
//!
//! This module provides the [`DownloadService`] trait, abstracting download history,
//! queue management, and search operations.

use crate::api::types::{DownloadDto, QueueItemDto};
use crate::domain::AnimeId;
use thiserror::Error;

/// Domain errors for download operations.
#[derive(Debug, Error)]
pub enum DownloadError {
    #[error("Database error: {0}")]
    Database(#[from] sea_orm::DbErr),

    #[error("QBittorrent error: {0}")]
    QBit(String),

    #[error("Anime not found: {0}")]
    AnimeNotFound(AnimeId),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<anyhow::Error> for DownloadError {
    fn from(err: anyhow::Error) -> Self {
        Self::Internal(err.to_string())
    }
}

/// Domain service trait for download operations.
#[async_trait::async_trait]
pub trait DownloadService: Send + Sync {
    /// Retrieves download history with anime titles.
    ///
    /// # Arguments
    ///
    /// * `limit` - Maximum number of records to return
    ///
    /// # Errors
    ///
    /// - Returns [`DownloadError::Database`] on connection failures
    async fn get_history(&self, limit: usize) -> Result<Vec<DownloadDto>, DownloadError>;

    /// Retrieves current download queue from qBittorrent enriched with metadata.
    ///
    /// # Errors
    ///
    /// - Returns [`DownloadError::QBit`] if qBittorrent API fails
    /// - Returns [`DownloadError::Database`] on connection failures
    async fn get_queue(&self) -> Result<Vec<QueueItemDto>, DownloadError>;

    /// Triggers a search for missing episodes.
    ///
    /// If `anime_id` is provided, searches only that anime. Otherwise performs
    /// a global search across all monitored anime with missing episodes.
    ///
    /// # Errors
    ///
    /// - Returns [`DownloadError::AnimeNotFound`] if specific anime doesn't exist
    /// - Returns [`DownloadError::Validation`] if parameters are invalid
    async fn search_missing(&self, anime_id: Option<AnimeId>) -> Result<(), DownloadError>;

    /// Downloads a release for an anime.
    ///
    /// This method handles:
    /// - Validating the anime exists
    /// - Creating the qBittorrent category
    /// - Adding the magnet link to qBittorrent
    /// - Recording the download in the database
    /// - Sending appropriate notifications
    ///
    /// # Arguments
    ///
    /// * `anime_id` - The ID of the anime to download for
    /// * `magnet` - The magnet link URL
    /// * `episode_number` - The episode number (0.0 for batches)
    /// * `title` - The title of the release
    /// * `group` - Optional release group name
    /// * `info_hash` - Optional info hash for the torrent
    /// * `is_batch` - Whether this is a batch download
    ///
    /// # Errors
    ///
    /// - Returns [`DownloadError::AnimeNotFound`] if anime doesn't exist
    /// - Returns [`DownloadError::QBit`] if qBittorrent operation fails
    /// - Returns [`DownloadError::Validation`] if download client is not enabled
    /// - Returns [`DownloadError::Database`] on database errors
    #[allow(clippy::too_many_arguments)]
    async fn download_release(
        &self,
        anime_id: AnimeId,
        magnet: String,
        episode_number: f32,
        title: String,
        group: Option<String>,
        info_hash: Option<String>,
        is_batch: bool,
    ) -> Result<(), DownloadError>;
}
