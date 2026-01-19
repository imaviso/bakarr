use axum::{
    Json,
    extract::{Query, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::IntoResponse,
};
use serde::Deserialize;
use std::sync::Arc;
use tower_sessions::Session;

use super::{ApiError, AppState};

#[derive(Deserialize)]
pub struct AuthQuery {
    pub api_key: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AuthQuery>,
    headers: HeaderMap,
    session: Session,
    request: Request,
    next: Next,
) -> Result<impl IntoResponse, ApiError> {
    if let Ok(Some(_user)) = session.get::<String>("user").await {
        return Ok(next.run(request).await);
    }
    let auth_config = {
        let config = state.config.read().await;
        config.auth.clone()
    };

    if let Some(key) = &query.api_key
        && key == &auth_config.api_key
    {
        return Ok(next.run(request).await);
    }

    if let Some(api_key) = headers.get("X-Api-Key")
        && let Ok(key_str) = api_key.to_str()
        && key_str == auth_config.api_key
    {
        return Ok(next.run(request).await);
    }

    if let Some(auth_header) = headers.get("Authorization")
        && let Ok(auth_str) = auth_header.to_str()
        && let Some(token) = auth_str.strip_prefix("Bearer ")
        && token.trim() == auth_config.api_key
    {
        return Ok(next.run(request).await);
    }

    let response = (StatusCode::UNAUTHORIZED, "Unauthorized");
    Ok(response.into_response())
}

#[derive(serde::Serialize)]
pub struct AuthResponse {
    pub username: String,
    pub api_key: Option<String>,
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let config = state.config.read().await;

    if payload.username == config.auth.username && payload.password == config.auth.password {
        if let Err(e) = session.insert("user", &payload.username).await {
            return Err(ApiError::internal(format!(
                "Failed to create session: {}",
                e
            )));
        }

        Ok(Json(AuthResponse {
            username: config.auth.username.clone(),
            api_key: None,
        }))
    } else {
        Err(ApiError::Unauthorized("Invalid credentials".to_string()))
    }
}

pub async fn logout(session: Session) -> impl IntoResponse {
    let _ = session.flush().await;
    (StatusCode::OK, "Logged out")
}
