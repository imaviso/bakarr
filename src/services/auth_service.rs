//! Domain service for authentication and user management.
//!
//! Handles login, session management, password changes, and API key management.

use serde::Serialize;
use thiserror::Error;

/// Errors specific to authentication operations.
#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("User not found")]
    UserNotFound,

    #[error("Session error: {0}")]
    SessionError(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<sea_orm::DbErr> for AuthError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err.to_string())
    }
}

impl From<anyhow::Error> for AuthError {
    fn from(err: anyhow::Error) -> Self {
        Self::Internal(err.to_string())
    }
}

/// User info DTO for responses.
#[derive(Debug, Clone, Serialize)]
pub struct UserInfo {
    pub username: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Login result containing user info and API key.
#[derive(Debug, Clone, Serialize)]
pub struct LoginResult {
    pub username: String,
    pub api_key: String,
}

/// Domain service trait for authentication.
#[async_trait::async_trait]
pub trait AuthService: Send + Sync {
    /// Verifies credentials and returns user info.
    ///
    /// # Errors
    ///
    /// Returns [`AuthError::InvalidCredentials`] if login fails.
    async fn login(&self, username: &str, password: &str) -> Result<LoginResult, AuthError>;

    /// Verifies an API key and returns the associated username if valid.
    async fn verify_api_key(&self, api_key: &str) -> Result<Option<String>, AuthError>;

    /// Gets information for a specific user.
    async fn get_user_info(&self, username: &str) -> Result<UserInfo, AuthError>;

    /// Changes a user's password.
    ///
    /// # Errors
    ///
    /// Returns [`AuthError::Validation`] if current password is incorrect or new password invalid.
    async fn change_password(
        &self,
        username: &str,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), AuthError>;

    /// Gets the current API key for a user.
    async fn get_api_key(&self, username: &str) -> Result<String, AuthError>;

    /// Regenerates the API key for a user and returns the new one.
    async fn regenerate_api_key(&self, username: &str) -> Result<String, AuthError>;
}
