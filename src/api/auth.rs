use axum::{
    Json,
    extract::{Query, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_sessions::Session;

use super::{ApiError, ApiResponse, AppState};

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Deserialize)]
pub struct AuthQuery {}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub username: String,
    pub api_key: String,
}

#[derive(Serialize)]
pub struct UserInfoResponse {
    pub username: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Serialize)]
pub struct ApiKeyResponse {
    pub api_key: String,
}

#[derive(Serialize)]
pub struct MessageResponse {
    pub message: String,
}

// ============================================================================
// Middleware
// ============================================================================

/// Authentication middleware that checks:
/// 1. Session cookie (from login)
/// 2. `X-Api-Key` header
/// 3. `Authorization: Bearer <api_key>` header
/// 4. `?api_key=` query parameter
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AuthQuery>,
    headers: HeaderMap,
    session: Session,
    request: Request,
    next: Next,
) -> Result<impl IntoResponse, ApiError> {
    // Check session first (fastest path for web UI)
    if let Ok(Some(user)) = session.get::<String>("user").await {
        tracing::Span::current().record("user_id", &user);
        return Ok(next.run(request).await);
    }

    // Extract API key from various sources
    let api_key = extract_api_key(&query, &headers);

    if let Some(key) = api_key {
        // Verify API key against database
        if let Ok(Some(user)) = state.store().verify_api_key(&key).await {
            tracing::Span::current().record("user_id", &user.username);
            return Ok(next.run(request).await);
        }
    }

    let response = (StatusCode::UNAUTHORIZED, "Unauthorized");
    Ok(response.into_response())
}

/// Extract API key from query params or headers
fn extract_api_key(_query: &AuthQuery, headers: &HeaderMap) -> Option<String> {
    // Check X-Api-Key header
    if let Some(api_key) = headers.get("X-Api-Key")
        && let Ok(key_str) = api_key.to_str()
    {
        return Some(key_str.to_string());
    }

    // Check Authorization: Bearer header
    if let Some(auth_header) = headers.get("Authorization")
        && let Ok(auth_str) = auth_header.to_str()
        && let Some(token) = auth_str.strip_prefix("Bearer ")
    {
        return Some(token.trim().to_string());
    }

    None
}

// ============================================================================
// Handlers
// ============================================================================

/// POST /auth/login
/// Authenticate with username and password, returns API key on success
pub async fn login(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, ApiError> {
    // Validate input
    if payload.username.is_empty() {
        return Err(ApiError::validation("Username is required"));
    }
    if payload.password.is_empty() {
        return Err(ApiError::validation("Password is required"));
    }

    // Verify credentials against database
    let is_valid = state
        .store()
        .verify_user_password(&payload.username, &payload.password)
        .await
        .map_err(|e| ApiError::internal(format!("Authentication error: {e}")))?;

    if !is_valid {
        return Err(ApiError::Unauthorized("Invalid credentials".to_string()));
    }

    // Get user info for response
    let user = state
        .store()
        .get_user_by_username(&payload.username)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to get user: {e}")))?
        .ok_or_else(|| ApiError::Unauthorized("User not found".to_string()))?;

    // Create session
    if let Err(e) = session.insert("user", &payload.username).await {
        return Err(ApiError::internal(format!("Failed to create session: {e}")));
    }

    Ok(Json(ApiResponse::success(LoginResponse {
        username: user.username,
        api_key: user.api_key,
    })))
}

/// POST /auth/logout
/// Invalidate the current session
pub async fn logout(session: Session) -> impl IntoResponse {
    let _ = session.flush().await;
    (StatusCode::OK, "Logged out")
}

/// GET /auth/me
/// Get current user information (requires authentication)
pub async fn get_current_user(
    State(state): State<Arc<AppState>>,
    session: Session,
) -> Result<Json<ApiResponse<UserInfoResponse>>, ApiError> {
    let username = get_session_username(&session).await?;

    let user = state
        .store()
        .get_user_by_username(&username)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to get user: {e}")))?
        .ok_or_else(|| ApiError::Unauthorized("User not found".to_string()))?;

    Ok(Json(ApiResponse::success(UserInfoResponse {
        username: user.username,
        created_at: user.created_at,
        updated_at: user.updated_at,
    })))
}

/// PUT /auth/password
/// Change password (requires current password verification)
pub async fn change_password(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<Json<ApiResponse<MessageResponse>>, ApiError> {
    let username = get_session_username(&session).await?;

    // Validate new password
    if payload.new_password.len() < 8 {
        return Err(ApiError::validation(
            "New password must be at least 8 characters",
        ));
    }

    if payload.current_password == payload.new_password {
        return Err(ApiError::validation(
            "New password must be different from current password",
        ));
    }

    // Verify current password
    let is_valid = state
        .store()
        .verify_user_password(&username, &payload.current_password)
        .await
        .map_err(|e| ApiError::internal(format!("Password verification error: {e}")))?;

    if !is_valid {
        return Err(ApiError::validation("Current password is incorrect"));
    }

    // Update password
    state
        .store()
        .update_user_password(&username, &payload.new_password)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to update password: {e}")))?;

    tracing::info!("Password changed for user: {username}");

    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Password updated successfully".to_string(),
    })))
}

/// GET /auth/api-key
/// Get the current API key
pub async fn get_api_key(
    State(state): State<Arc<AppState>>,
    session: Session,
) -> Result<Json<ApiResponse<ApiKeyResponse>>, ApiError> {
    let username = get_session_username(&session).await?;

    let api_key = state
        .store()
        .get_user_api_key(&username)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to get API key: {e}")))?
        .ok_or_else(|| ApiError::internal("API key not found"))?;

    Ok(Json(ApiResponse::success(ApiKeyResponse { api_key })))
}

/// POST /auth/api-key/regenerate
/// Generate a new random API key
pub async fn regenerate_api_key(
    State(state): State<Arc<AppState>>,
    session: Session,
) -> Result<Json<ApiResponse<ApiKeyResponse>>, ApiError> {
    let username = get_session_username(&session).await?;

    let new_api_key = state
        .store()
        .regenerate_user_api_key(&username)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to regenerate API key: {e}")))?;

    tracing::info!("API key regenerated for user: {username}");

    Ok(Json(ApiResponse::success(ApiKeyResponse {
        api_key: new_api_key,
    })))
}

// ============================================================================
// Helpers
// ============================================================================

/// Get username from session, returns error if not authenticated
async fn get_session_username(session: &Session) -> Result<String, ApiError> {
    session
        .get::<String>("user")
        .await
        .map_err(|e| ApiError::internal(format!("Session error: {e}")))?
        .ok_or_else(|| ApiError::Unauthorized("Not authenticated".to_string()))
}
