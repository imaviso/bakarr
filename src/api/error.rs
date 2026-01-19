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
            ApiError::NotFound(msg) => write!(f, "Not found: {}", msg),
            ApiError::DatabaseError(msg) => write!(f, "Database error: {}", msg),
            ApiError::ExternalApiError { service, message } => {
                write!(f, "{} error: {}", service, message)
            }
            ApiError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            ApiError::NotImplemented(msg) => write!(f, "Not implemented: {}", msg),
            ApiError::Conflict(msg) => write!(f, "Conflict: {}", msg),

            ApiError::InternalError(msg) => write!(f, "Internal error: {}", msg),
            ApiError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
        }
    }
}

impl std::error::Error for ApiError {}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiError::DatabaseError(msg) => {
                tracing::error!("Database error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "A database error occurred".to_string(),
                )
            }
            ApiError::ExternalApiError { service, message } => {
                tracing::warn!("{} API error: {}", service, message);
                (
                    StatusCode::BAD_GATEWAY,
                    format!("{} service is unavailable", service),
                )
            }
            ApiError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            ApiError::NotImplemented(msg) => (StatusCode::NOT_IMPLEMENTED, msg.clone()),
            ApiError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            ApiError::InternalError(msg) => {
                tracing::error!("Internal error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "An internal error occurred".to_string(),
                )
            }
            ApiError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
        };

        let body = ApiResponse::<()>::error(error_message);
        (status, Json(body)).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError::InternalError(err.to_string())
    }
}

impl ApiError {
    pub fn not_found(resource: &str, id: impl fmt::Display) -> Self {
        ApiError::NotFound(format!("{} {} not found", resource, id))
    }

    pub fn anime_not_found(id: i32) -> Self {
        ApiError::NotFound(format!("Anime {} not found", id))
    }

    pub fn profile_not_found(name: &str) -> Self {
        ApiError::NotFound(format!("Profile '{}' not found", name))
    }

    pub fn anilist_error(msg: impl Into<String>) -> Self {
        ApiError::ExternalApiError {
            service: "AniList".to_string(),
            message: msg.into(),
        }
    }

    pub fn qbittorrent_error(msg: impl Into<String>) -> Self {
        ApiError::ExternalApiError {
            service: "qBittorrent".to_string(),
            message: msg.into(),
        }
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        ApiError::ValidationError(msg.into())
    }

    pub fn not_implemented(feature: &str) -> Self {
        ApiError::NotImplemented(format!(
            "{} is not yet implemented. Please edit config.toml",
            feature
        ))
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        ApiError::InternalError(msg.into())
    }
}
