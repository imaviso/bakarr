//! Provenance tracking for metadata fields.
//!
//! This module provides utilities to track which external provider (`AniList`,
//! Jikan/MAL, Kitsu) provided each piece of metadata. This helps with debugging
//! data quality issues and understanding data lineage.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Error type for provenance operations.
#[derive(Debug, Error)]
pub enum ProvenanceError {
    #[error("Failed to parse provenance JSON: {0}")]
    JsonParse(#[from] serde_json::Error),
}

/// Identifies the source of metadata.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MetadataProvider {
    Anilist,
    Jikan,
    Kitsu,
}

impl MetadataProvider {
    /// Returns the string representation of the provider.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use bakarr::services::provenance::MetadataProvider;
    ///
    /// assert_eq!(MetadataProvider::Anilist.as_str(), "anilist");
    /// ```
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Anilist => "anilist",
            Self::Jikan => "jikan",
            Self::Kitsu => "kitsu",
        }
    }
}

impl std::fmt::Display for MetadataProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Tracks provenance for anime-level metadata fields.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AnimeProvenance {
    /// Which provider provided the description/synopsis
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<MetadataProvider>,
    /// Which provider provided the score/rating
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<MetadataProvider>,
    /// Which provider provided the genres
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genres: Option<MetadataProvider>,
    /// Which provider provided the studios
    #[serde(skip_serializing_if = "Option::is_none")]
    pub studios: Option<MetadataProvider>,
    /// Which provider provided the cover image
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_image: Option<MetadataProvider>,
    /// Which provider provided the banner image
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner_image: Option<MetadataProvider>,
}

impl AnimeProvenance {
    /// Creates an empty provenance tracker.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use bakarr::services::provenance::AnimeProvenance;
    ///
    /// let provenance = AnimeProvenance::new();
    /// ```
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Records that the description was populated by a specific provider.
    pub const fn record_description(&mut self, provider: MetadataProvider) {
        self.description = Some(provider);
    }

    /// Records that the score was populated by a specific provider.
    pub const fn record_score(&mut self, provider: MetadataProvider) {
        self.score = Some(provider);
    }

    /// Records that the genres were populated by a specific provider.
    pub const fn record_genres(&mut self, provider: MetadataProvider) {
        self.genres = Some(provider);
    }

    /// Records that the studios were populated by a specific provider.
    pub const fn record_studios(&mut self, provider: MetadataProvider) {
        self.studios = Some(provider);
    }

    /// Records that the cover image was populated by a specific provider.
    pub const fn record_cover_image(&mut self, provider: MetadataProvider) {
        self.cover_image = Some(provider);
    }

    /// Records that the banner image was populated by a specific provider.
    pub const fn record_banner_image(&mut self, provider: MetadataProvider) {
        self.banner_image = Some(provider);
    }

    /// Serializes the provenance to a JSON string for storage.
    ///
    /// Returns `None` if all fields are `None` (no provenance tracked).
    ///
    /// # Examples
    ///
    /// ```rust
    /// use bakarr::services::provenance::{AnimeProvenance, MetadataProvider};
    ///
    /// let mut prov = AnimeProvenance::new();
    /// prov.record_description(MetadataProvider::Kitsu);
    /// let json = prov.to_json();
    /// assert!(json.is_some());
    /// ```
    #[must_use]
    pub fn to_json(&self) -> Option<String> {
        // Check if there's any provenance to store
        if self.description.is_none()
            && self.score.is_none()
            && self.genres.is_none()
            && self.studios.is_none()
            && self.cover_image.is_none()
            && self.banner_image.is_none()
        {
            return None;
        }

        serde_json::to_string(self).ok()
    }

    /// Deserializes provenance from a JSON string.
    ///
    /// Returns a default (empty) provenance if parsing fails.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use bakarr::services::provenance::AnimeProvenance;
    ///
    /// let json = r#"{"description": "kitsu"}"#;
    /// let prov = AnimeProvenance::from_json(json);
    /// ```
    #[must_use]
    pub fn from_json(json: &str) -> Self {
        Self::try_from_json(json).unwrap_or_default()
    }

    /// Deserializes provenance from a JSON string, returning an error if parsing fails.
    ///
    /// # Errors
    ///
    /// Returns `ProvenanceError::JsonParse` if the JSON is invalid.
    pub fn try_from_json(json: &str) -> Result<Self, ProvenanceError> {
        serde_json::from_str(json).map_err(ProvenanceError::JsonParse)
    }
}

/// Tracks provenance for episode-level metadata fields.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EpisodeProvenance {
    /// Which provider provided the title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<MetadataProvider>,
    /// Which provider provided the Japanese title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_japanese: Option<MetadataProvider>,
    /// Which provider provided the air date
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aired: Option<MetadataProvider>,
    /// Which provider provided the filler flag
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filler: Option<MetadataProvider>,
    /// Which provider provided the recap flag
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recap: Option<MetadataProvider>,
}

impl EpisodeProvenance {
    /// Creates an empty provenance tracker.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use bakarr::services::provenance::EpisodeProvenance;
    ///
    /// let provenance = EpisodeProvenance::new();
    /// ```
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Records that the title was populated by a specific provider.
    pub const fn record_title(&mut self, provider: MetadataProvider) {
        self.title = Some(provider);
    }

    /// Records that the Japanese title was populated by a specific provider.
    pub const fn record_title_japanese(&mut self, provider: MetadataProvider) {
        self.title_japanese = Some(provider);
    }

    /// Records that the air date was populated by a specific provider.
    pub const fn record_aired(&mut self, provider: MetadataProvider) {
        self.aired = Some(provider);
    }

    /// Records that the filler flag was populated by a specific provider.
    pub const fn record_filler(&mut self, provider: MetadataProvider) {
        self.filler = Some(provider);
    }

    /// Records that the recap flag was populated by a specific provider.
    pub const fn record_recap(&mut self, provider: MetadataProvider) {
        self.recap = Some(provider);
    }

    /// Serializes the provenance to a JSON string for storage.
    ///
    /// Returns `None` if all fields are `None` (no provenance tracked).
    ///
    /// # Examples
    ///
    /// ```rust
    /// use bakarr::services::provenance::{EpisodeProvenance, MetadataProvider};
    ///
    /// let mut prov = EpisodeProvenance::new();
    /// prov.record_title(MetadataProvider::Anilist);
    /// let json = prov.to_json();
    /// assert!(json.is_some());
    /// ```
    #[must_use]
    pub fn to_json(&self) -> Option<String> {
        if self.title.is_none()
            && self.title_japanese.is_none()
            && self.aired.is_none()
            && self.filler.is_none()
            && self.recap.is_none()
        {
            return None;
        }

        serde_json::to_string(self).ok()
    }

    /// Deserializes provenance from a JSON string.
    ///
    /// Returns a default (empty) provenance if parsing fails.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use bakarr::services::provenance::EpisodeProvenance;
    ///
    /// let json = r#"{"title": "anilist"}"#;
    /// let prov = EpisodeProvenance::from_json(json);
    /// ```
    #[must_use]
    pub fn from_json(json: &str) -> Self {
        Self::try_from_json(json).unwrap_or_default()
    }

    /// Deserializes provenance from a JSON string, returning an error if parsing fails.
    ///
    /// # Errors
    ///
    /// Returns `ProvenanceError::JsonParse` if the JSON is invalid.
    pub fn try_from_json(json: &str) -> Result<Self, ProvenanceError> {
        serde_json::from_str(json).map_err(ProvenanceError::JsonParse)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metadata_provider_as_str() {
        assert_eq!(MetadataProvider::Anilist.as_str(), "anilist");
        assert_eq!(MetadataProvider::Jikan.as_str(), "jikan");
        assert_eq!(MetadataProvider::Kitsu.as_str(), "kitsu");
    }

    #[test]
    fn test_anime_provenance_record() {
        let mut prov = AnimeProvenance::new();
        prov.record_description(MetadataProvider::Jikan);
        prov.record_score(MetadataProvider::Kitsu);

        assert_eq!(prov.description, Some(MetadataProvider::Jikan));
        assert_eq!(prov.score, Some(MetadataProvider::Kitsu));
    }

    #[test]
    fn test_anime_provenance_to_json() {
        let mut prov = AnimeProvenance::new();
        prov.record_description(MetadataProvider::Jikan);

        let json = prov.to_json().expect("Should serialize");
        assert!(json.contains("jikan"));
        assert!(json.contains("description"));
    }

    #[test]
    fn test_anime_provenance_empty_to_json() {
        let prov = AnimeProvenance::new();
        assert!(prov.to_json().is_none());
    }

    #[test]
    fn test_anime_provenance_from_json() {
        let json = r#"{"description":"jikan","score":"kitsu"}"#;
        let prov = AnimeProvenance::from_json(json);

        assert_eq!(prov.description, Some(MetadataProvider::Jikan));
        assert_eq!(prov.score, Some(MetadataProvider::Kitsu));
    }

    #[test]
    fn test_episode_provenance_roundtrip() {
        let mut prov = EpisodeProvenance::new();
        prov.record_title(MetadataProvider::Kitsu);
        prov.record_aired(MetadataProvider::Anilist);

        let json = prov.to_json().expect("Should serialize");
        let prov2 = EpisodeProvenance::from_json(&json);

        assert_eq!(prov2.title, Some(MetadataProvider::Kitsu));
        assert_eq!(prov2.aired, Some(MetadataProvider::Anilist));
    }
}
