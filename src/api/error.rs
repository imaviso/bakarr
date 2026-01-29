use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::fmt;

use super::ApiResponse;

#[derive(Debug)]
pub enum ApiError {
    NotFound(String),

    DatabaseError(String),

    ExternalApiError { service: String, message: String },

    ValidationError(String),

    NotImplemented(String),

    Conflict(String),

    InternalError(String),

    Unauthorized(String),
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(msg) => write!(f, "Not found: {msg}"),
            Self::DatabaseError(msg) => write!(f, "Database error: {msg}"),
            Self::ExternalApiError { service, message } => {
                write!(f, "{service} error: {message}")
            }
            Self::ValidationError(msg) => write!(f, "Validation error: {msg}"),
            Self::NotImplemented(msg) => write!(f, "Not implemented: {msg}"),
            Self::Conflict(msg) => write!(f, "Conflict: {msg}"),

            Self::InternalError(msg) => write!(f, "Internal error: {msg}"),
            Self::Unauthorized(msg) => write!(f, "Unauthorized: {msg}"),
        }
    }
}

impl std::error::Error for ApiError {}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            Self::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            Self::DatabaseError(msg) => {
                tracing::error!("Database error: {msg}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "A database error occurred".to_string(),
                )
            }
            Self::ExternalApiError { service, message } => {
                tracing::warn!("{service} API error: {message}");
                (
                    StatusCode::BAD_GATEWAY,
                    format!("{service} service is unavailable"),
                )
            }
            Self::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            Self::NotImplemented(msg) => (StatusCode::NOT_IMPLEMENTED, msg.clone()),
            Self::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            Self::InternalError(msg) => {
                tracing::error!("Internal error: {msg}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "An internal error occurred".to_string(),
                )
            }
            Self::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
        };

        let body = ApiResponse::<()>::error(error_message);
        (status, Json(body)).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        tracing::error!(error = ?err, "Internal Server Error");
        Self::InternalError("An unexpected internal error occurred".to_string())
    }
}

impl ApiError {
    #[must_use]
    pub fn not_found(resource: &str, id: impl fmt::Display) -> Self {
        Self::NotFound(format!("{resource} {id} not found"))
    }

    #[must_use]
    pub fn anime_not_found(id: i32) -> Self {
        Self::NotFound(format!("Anime {id} not found"))
    }

    #[must_use]
    pub fn profile_not_found(name: &str) -> Self {
        Self::NotFound(format!("Profile '{name}' not found"))
    }

    #[must_use]
    pub fn anilist_error(msg: impl Into<String>) -> Self {
        Self::ExternalApiError {
            service: "AniList".to_string(),
            message: msg.into(),
        }
    }

    #[must_use]
    pub fn qbittorrent_error(msg: impl Into<String>) -> Self {
        Self::ExternalApiError {
            service: "qBittorrent".to_string(),
            message: msg.into(),
        }
    }

    #[must_use]
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::ValidationError(msg.into())
    }

    #[must_use]
    pub fn not_implemented(feature: &str) -> Self {
        Self::NotImplemented(format!(
            "{feature} is not yet implemented. Please edit config.toml"
        ))
    }

    #[must_use]
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::InternalError(msg.into())
    }
}
