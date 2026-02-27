use axum::{
    extract::{Path, State},
    response::IntoResponse,
};
use std::sync::Arc;
use tower_http::services::ServeFile;

use super::{ApiError, AppState};
use crate::api::validation::{validate_anime_id, validate_episode_number};

use axum::extract::Query;

#[derive(serde::Deserialize)]
pub struct StreamParams {
    token: Option<String>,
}

pub async fn stream_episode(
    State(state): State<Arc<AppState>>,
    Path((id, number)): Path<(i32, i32)>,
    Query(params): Query<StreamParams>,
    headers: axum::http::HeaderMap,
    session: tower_sessions::Session,
) -> Result<impl IntoResponse, ApiError> {
    let allow_query_token = state.config().read().await.server.allow_api_key_in_query;

    let is_authenticated = if let Ok(Some(_user)) = session.get::<String>("user").await {
        true
    } else if let Some(header_token) = extract_token_from_headers(&headers) {
        state
            .store()
            .verify_api_key(&header_token)
            .await
            .map(|u| u.is_some())
            .unwrap_or(false)
    } else if let Some(token) = &params.token {
        if allow_query_token {
            state
                .store()
                .verify_api_key(token)
                .await
                .map(|u| u.is_some())
                .unwrap_or(false)
        } else {
            false
        }
    } else {
        false
    };

    if !is_authenticated {
        return Err(ApiError::Unauthorized(
            "Invalid or missing authentication".to_string(),
        ));
    }

    validate_anime_id(id)?;
    validate_episode_number(number)?;

    let status = state
        .store()
        .get_episode_status(id, number)
        .await?
        .ok_or_else(|| ApiError::NotFound("Episode not found".to_string()))?;

    let file_path = status
        .file_path
        .ok_or_else(|| ApiError::NotFound("File not found for this episode".to_string()))?;

    let path = std::path::PathBuf::from(file_path);
    if !path.exists() {
        return Err(ApiError::NotFound("Video file missing on disk".to_string()));
    }

    let range_header = headers
        .get("range")
        .cloned()
        .unwrap_or_else(|| axum::http::HeaderValue::from_static("bytes=0-"));

    let req = axum::http::Request::builder()
        .header("range", range_header)
        .body(axum::body::Body::empty())
        .map_err(|e| ApiError::internal(format!("Failed to build request: {e}")))?;

    match ServeFile::new(path).try_call(req).await {
        Ok(res) => Ok(res),
        Err(e) => Err(ApiError::internal(format!("Streaming error: {e}"))),
    }
}

fn extract_token_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    if let Some(api_key) = headers.get("X-Api-Key")
        && let Ok(key_str) = api_key.to_str()
    {
        return Some(key_str.to_string());
    }

    if let Some(auth_header) = headers.get("Authorization")
        && let Ok(auth_str) = auth_header.to_str()
        && let Some(token) = auth_str.strip_prefix("Bearer ")
    {
        return Some(token.trim().to_string());
    }

    None
}
