//! Domain service for anime management operations.
//!
//! This module provides a clean domain layer abstraction over data access,
//! enabling testability and separation of concerns per Principal Rust standards.

use crate::api::types::{AnimeDto, EpisodeProgress, SearchResultDto, TitleDto};
use crate::domain::AnimeId;
use crate::models::anime::Anime;
use thiserror::Error;

/// Domain errors for anime operations.
///
/// Implements C-GOOD-ERR: errors must be meaningful, implement `std::error::Error`,
/// Send, Sync, and Display.
#[derive(Debug, Error)]
pub enum AnimeError {
    #[error("Anime not found: {0}")]
    NotFound(AnimeId),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Invalid anime data: {0}")]
    InvalidData(String),

    #[error("External API error: {service} - {message}")]
    ExternalApi { service: String, message: String },
}

impl AnimeError {
    /// Creates an external API error for `AniList`.
    pub fn anilist_error(msg: impl Into<String>) -> Self {
        Self::ExternalApi {
            service: "AniList".to_string(),
            message: msg.into(),
        }
    }
}

impl From<sea_orm::DbErr> for AnimeError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err.to_string())
    }
}

/// Domain service trait for anime operations.
///
/// This trait abstracts anime-related business logic, enabling:
/// - Testability through mocking
/// - Separation of concerns (handlers don't touch DB directly)
/// - Clean architecture with dependency inversion
///
/// # Examples
///
/// ```rust,ignore
/// use bakarr::services::{AnimeService, AnimeError};
/// use bakarr::domain::AnimeId;
/// use std::sync::Arc;
///
/// async fn example(service: Arc<dyn AnimeService>) -> Result<(), AnimeError> {
///     let anime_id = AnimeId::new(1);
///     let _details = service.get_anime_details(anime_id).await?;
///     Ok(())
/// }
/// ```
#[async_trait::async_trait]
pub trait AnimeService: Send + Sync {
    /// Retrieves detailed information for a specific anime.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::NotFound`] if anime does not exist
    /// - Returns [`AnimeError::Database`] on connection failures
    async fn get_anime_details(&self, id: AnimeId) -> Result<AnimeDto, AnimeError>;

    /// Lists all monitored anime with their progress.
    ///
    /// # Errors
    ///
    /// Returns [`AnimeError::Database`] on connection failures.
    async fn list_monitored_anime(&self) -> Result<Vec<AnimeDto>, AnimeError>;

    /// Lists all anime in the library.
    ///
    /// # Errors
    ///
    /// Returns [`AnimeError::Database`] on connection failures.
    async fn list_all_anime(&self) -> Result<Vec<AnimeDto>, AnimeError>;

    /// Adds a new anime to the library.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::ExternalApi`] if fetching from `AniList` fails
    /// - Returns [`AnimeError::Database`] on connection failures
    async fn add_anime(
        &self,
        id: AnimeId,
        profile_name: Option<String>,
        root_folder: Option<String>,
        monitored: bool,
        release_profile_ids: &[i32],
    ) -> Result<AnimeDto, AnimeError>;

    /// Removes an anime from the library.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::NotFound`] if anime does not exist
    /// - Returns [`AnimeError::Database`] on connection failures
    async fn remove_anime(&self, id: AnimeId) -> Result<(), AnimeError>;

    /// Toggles monitoring status for an anime.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::NotFound`] if anime does not exist
    /// - Returns [`AnimeError::Database`] on connection failures
    async fn toggle_monitor(&self, id: AnimeId, monitored: bool) -> Result<(), AnimeError>;

    /// Updates the quality profile for an anime.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::NotFound`] if anime or profile does not exist
    /// - Returns [`AnimeError::Database`] on connection failures
    async fn update_quality_profile(
        &self,
        id: AnimeId,
        profile_name: String,
    ) -> Result<(), AnimeError>;

    /// Assigns release profiles to an anime.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::NotFound`] if anime does not exist
    /// - Returns [`AnimeError::Database`] on connection failures
    async fn assign_release_profiles(
        &self,
        id: AnimeId,
        profile_ids: Vec<i32>,
    ) -> Result<(), AnimeError>;

    /// Updates the file system path for an anime.
    ///
    /// This method validates the path exists and updates the database record.
    /// Note: The actual folder scanning/rescanning is the responsibility of
    /// the caller (handler) as it involves background task spawning.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::NotFound`] if anime does not exist
    /// - Returns [`AnimeError::InvalidData`] if path does not exist or is invalid
    /// - Returns [`AnimeError::Database`] on connection failures
    async fn update_anime_path(&self, id: AnimeId, path: String) -> Result<(), AnimeError>;

    /// Searches for anime on external provider (`AniList`).
    ///
    /// This method searches `AniList` for anime matching the query string.
    /// Results include metadata about whether the anime is already in the
    /// local library.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::ExternalApi`] if fetching from `AniList` fails
    async fn search_remote_anime(&self, query: &str) -> Result<Vec<SearchResultDto>, AnimeError>;

    /// Gets details of a specific anime from external provider (`AniList`).
    ///
    /// This method fetches a single anime by ID from `AniList`.
    /// Results include metadata about whether the anime is already in the
    /// local library.
    ///
    /// # Errors
    ///
    /// - Returns [`AnimeError::NotFound`] if anime does not exist in `AniList`
    /// - Returns [`AnimeError::ExternalApi`] if fetching from `AniList` fails
    async fn get_remote_anime(&self, id: AnimeId) -> Result<SearchResultDto, AnimeError>;
}

/// Pure domain function to calculate missing episodes.
///
/// This function is pure (no side effects) and can be unit tested without
/// any database or I/O dependencies.
///
/// # Arguments
///
/// * `total_episodes` - The total number of episodes expected
/// * `downloaded_episodes` - Sorted slice of downloaded episode numbers
///
/// # Returns
///
/// Vector of missing episode numbers
///
/// # Examples
///
/// ```
/// # use bakarr::services::anime_service::calculate_missing_episodes;
/// let downloaded = vec![1, 2, 4, 5];
/// let missing = calculate_missing_episodes(5, &downloaded);
/// assert_eq!(missing, vec![3]);
/// ```
#[must_use]
pub fn calculate_missing_episodes(total_episodes: i32, downloaded_episodes: &[i32]) -> Vec<i32> {
    if total_episodes <= 0 {
        return Vec::new();
    }

    let mut missing = Vec::new();
    let mut down_idx = 0;

    for ep in 1..=total_episodes {
        // Advance index while downloaded episode is less than current
        while down_idx < downloaded_episodes.len() && downloaded_episodes[down_idx] < ep {
            down_idx += 1;
        }

        // Check if current episode is downloaded
        if down_idx < downloaded_episodes.len() && downloaded_episodes[down_idx] == ep {
            continue; // Downloaded
        }
        missing.push(ep);
    }

    missing
}

/// Converts an Anime model to an `AnimeDto`.
///
/// Centralizes DTO conversion logic per DRY principle.
pub fn anime_to_dto(
    anime: Anime,
    downloaded: i32,
    missing: Vec<i32>,
    release_profile_ids: Vec<i32>,
) -> AnimeDto {
    AnimeDto {
        id: anime.id,
        title: TitleDto {
            romaji: anime.title.romaji.clone(),
            english: anime.title.english.clone(),
            native: anime.title.native.clone(),
        },
        format: anime.format,
        episode_count: anime.episode_count.map(i64::from),
        status: anime.status,
        cover_image: anime.cover_image.map(|p| format!("/images/{p}")),
        banner_image: anime.banner_image.map(|p| format!("/images/{p}")),
        profile_name: anime.profile_name.unwrap_or_else(|| "Unknown".to_string()),
        root_folder: anime.path.unwrap_or_default(),
        monitored: anime.monitored,
        added_at: anime.added_at,
        mal_id: anime.mal_id,
        description: anime.description,
        score: anime.score,
        genres: anime.genres.unwrap_or_default(),
        studios: anime.studios.unwrap_or_default(),
        progress: EpisodeProgress {
            downloaded: i64::from(downloaded),
            total: anime.episode_count.map(i64::from),
            missing,
        },
        release_profile_ids,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculate_missing_episodes_basic() {
        let downloaded = vec![1, 2, 4, 5];
        let missing = calculate_missing_episodes(5, &downloaded);
        assert_eq!(missing, vec![3]);
    }

    #[test]
    fn calculate_missing_episodes_none_missing() {
        let downloaded = vec![1, 2, 3, 4, 5];
        let missing = calculate_missing_episodes(5, &downloaded);
        assert!(missing.is_empty());
    }

    #[test]
    fn calculate_missing_episodes_all_missing() {
        let downloaded: Vec<i32> = vec![];
        let missing = calculate_missing_episodes(3, &downloaded);
        assert_eq!(missing, vec![1, 2, 3]);
    }

    #[test]
    fn calculate_missing_episodes_with_sorting() {
        // Function requires sorted input - callers must sort
        let mut downloaded = vec![5, 1, 4, 2];
        downloaded.sort_unstable();
        let missing = calculate_missing_episodes(5, &downloaded);
        assert_eq!(missing, vec![3]);
    }

    #[test]
    fn calculate_missing_episodes_zero_total() {
        let downloaded = vec![1, 2];
        let missing = calculate_missing_episodes(0, &downloaded);
        assert!(missing.is_empty());
    }

    #[test]
    fn calculate_missing_episodes_negative_total() {
        let downloaded = vec![1, 2];
        let missing = calculate_missing_episodes(-1, &downloaded);
        assert!(missing.is_empty());
    }

    #[test]
    fn anime_error_display() {
        let err = AnimeError::NotFound(AnimeId::new(42));
        assert_eq!(err.to_string(), "Anime not found: 42");

        let err = AnimeError::anilist_error("network timeout");
        assert_eq!(
            err.to_string(),
            "External API error: AniList - network timeout"
        );
    }
}
