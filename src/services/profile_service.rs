//! Domain service for managing quality and release profiles.
//!
//! Handles quality profile configuration (cutoff, allowed qualities) and
//! release profile rules (preferred terms, scores).

use crate::api::types::{ProfileDto, QualityDto};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// DTO for a release profile.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReleaseProfileDto {
    pub id: i32,
    pub name: String,
    pub enabled: bool,
    pub is_global: bool,
    pub rules: Vec<ReleaseProfileRuleDtoPublic>,
}

/// Public representation of a release profile rule.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReleaseProfileRuleDtoPublic {
    pub term: String,
    pub score: i32,
    pub rule_type: String,
}

/// Errors specific to profile operations.
#[derive(Debug, Error)]
pub enum ProfileError {
    #[error("Profile not found: {0}")]
    NotFound(String),

    #[error("Release profile not found: {0}")]
    ReleaseProfileNotFound(i32),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<sea_orm::DbErr> for ProfileError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err.to_string())
    }
}

impl From<anyhow::Error> for ProfileError {
    fn from(err: anyhow::Error) -> Self {
        Self::Internal(err.to_string())
    }
}

/// Domain service trait for profiles.
#[async_trait::async_trait]
pub trait ProfileService: Send + Sync {
    // Quality Profiles (Config-based)

    /// Lists all available qualities.
    async fn list_qualities(&self) -> Result<Vec<QualityDto>, ProfileError>;

    /// Lists all quality profiles.
    async fn list_quality_profiles(&self) -> Result<Vec<ProfileDto>, ProfileError>;

    /// Gets a specific quality profile by name.
    async fn get_quality_profile(&self, name: &str) -> Result<ProfileDto, ProfileError>;

    /// Creates a new quality profile.
    async fn create_quality_profile(&self, profile: ProfileDto)
    -> Result<ProfileDto, ProfileError>;

    /// Updates an existing quality profile.
    async fn update_quality_profile(
        &self,
        name: &str,
        profile: ProfileDto,
    ) -> Result<ProfileDto, ProfileError>;

    /// Deletes a quality profile.
    async fn delete_quality_profile(&self, name: &str) -> Result<(), ProfileError>;

    // Release Profiles (DB-based)

    /// Lists all release profiles.
    async fn list_release_profiles(&self) -> Result<Vec<ReleaseProfileDto>, ProfileError>;

    /// Creates a new release profile.
    async fn create_release_profile(
        &self,
        name: String,
        enabled: bool,
        is_global: bool,
        rules: Vec<ReleaseProfileRuleDtoPublic>,
    ) -> Result<ReleaseProfileDto, ProfileError>;

    /// Updates an existing release profile.
    async fn update_release_profile(
        &self,
        id: i32,
        name: String,
        enabled: bool,
        is_global: bool,
        rules: Vec<ReleaseProfileRuleDtoPublic>,
    ) -> Result<(), ProfileError>;

    /// Deletes a release profile.
    async fn delete_release_profile(&self, id: i32) -> Result<(), ProfileError>;
}
