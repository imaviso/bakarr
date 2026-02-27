use axum::{
    Json,
    extract::{Query, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tower_sessions::Session;

use super::{ApiError, ApiResponse, AppState};

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Deserialize)]
pub struct AuthQuery {
    pub api_key: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

pub use crate::services::auth_service::{
    LoginResult as LoginResponse, UserInfo as UserInfoResponse,
};

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

#[derive(Clone, Copy)]
struct RateLimitPolicy {
    max_attempts: u32,
    window: Duration,
    block_duration: Duration,
    base_delay: Duration,
    max_delay: Duration,
}

impl RateLimitPolicy {
    fn from_login_config(config: &crate::config::AuthThrottleConfig) -> Self {
        let base_delay_ms = config.login_base_delay_ms.max(1);
        let max_delay_ms = config.login_max_delay_ms.max(base_delay_ms);

        Self {
            max_attempts: config.max_attempts.max(1),
            window: Duration::from_secs(config.window_seconds.max(1)),
            block_duration: Duration::from_secs(config.lockout_seconds.max(1)),
            base_delay: Duration::from_millis(base_delay_ms),
            max_delay: Duration::from_millis(max_delay_ms),
        }
    }

    fn from_password_config(config: &crate::config::AuthThrottleConfig) -> Self {
        let base_delay_ms = config.password_base_delay_ms.max(1);
        let max_delay_ms = config.password_max_delay_ms.max(base_delay_ms);

        Self {
            max_attempts: config.max_attempts.max(1),
            window: Duration::from_secs(config.window_seconds.max(1)),
            block_duration: Duration::from_secs(config.lockout_seconds.max(1)),
            base_delay: Duration::from_millis(base_delay_ms),
            max_delay: Duration::from_millis(max_delay_ms),
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct AttemptState {
    window_started_at: tokio::time::Instant,
    failures: u32,
    blocked_until: Option<tokio::time::Instant>,
    last_seen: tokio::time::Instant,
}

impl AttemptState {
    const fn new(now: tokio::time::Instant) -> Self {
        Self {
            window_started_at: now,
            failures: 0,
            blocked_until: None,
            last_seen: now,
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) struct FailureAction {
    delay: Duration,
    blocked_for: Option<Duration>,
}

#[derive(Default)]
pub struct AuthRateLimiter {
    login_attempts: HashMap<String, AttemptState>,
    password_attempts: HashMap<String, AttemptState>,
    operation_count: u64,
}

impl AuthRateLimiter {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    fn login_blocked_for(&mut self, key: &str, policy: RateLimitPolicy) -> Option<Duration> {
        let now = tokio::time::Instant::now();
        self.maybe_cleanup(now);
        Self::blocked_for(&mut self.login_attempts, key, now, policy)
    }

    fn password_blocked_for(&mut self, key: &str, policy: RateLimitPolicy) -> Option<Duration> {
        let now = tokio::time::Instant::now();
        self.maybe_cleanup(now);
        Self::blocked_for(&mut self.password_attempts, key, now, policy)
    }

    fn record_login_failure(&mut self, key: &str, policy: RateLimitPolicy) -> FailureAction {
        let now = tokio::time::Instant::now();
        self.maybe_cleanup(now);
        Self::record_failure(&mut self.login_attempts, key, now, policy)
    }

    fn record_password_failure(&mut self, key: &str, policy: RateLimitPolicy) -> FailureAction {
        let now = tokio::time::Instant::now();
        self.maybe_cleanup(now);
        Self::record_failure(&mut self.password_attempts, key, now, policy)
    }

    fn reset_login(&mut self, key: &str) {
        self.login_attempts.remove(key);
    }

    fn reset_password(&mut self, key: &str) {
        self.password_attempts.remove(key);
    }

    fn blocked_for(
        attempts: &mut HashMap<String, AttemptState>,
        key: &str,
        now: tokio::time::Instant,
        policy: RateLimitPolicy,
    ) -> Option<Duration> {
        let state = attempts.get_mut(key)?;
        state.last_seen = now;

        if now.duration_since(state.window_started_at) > policy.window {
            state.window_started_at = now;
            state.failures = 0;
            state.blocked_until = None;
            return None;
        }

        if let Some(until) = state.blocked_until {
            if until > now {
                return Some(until - now);
            }

            state.blocked_until = None;
            state.failures = 0;
            state.window_started_at = now;
        }

        None
    }

    fn record_failure(
        attempts: &mut HashMap<String, AttemptState>,
        key: &str,
        now: tokio::time::Instant,
        policy: RateLimitPolicy,
    ) -> FailureAction {
        let state = attempts
            .entry(key.to_string())
            .or_insert_with(|| AttemptState::new(now));

        if now.duration_since(state.window_started_at) > policy.window {
            state.window_started_at = now;
            state.failures = 0;
            state.blocked_until = None;
        }

        state.last_seen = now;
        state.failures = state.failures.saturating_add(1);

        let base_delay_ms = u64::try_from(policy.base_delay.as_millis()).unwrap_or(u64::MAX);
        let max_delay_ms = u64::try_from(policy.max_delay.as_millis()).unwrap_or(u64::MAX);
        let delay_ms = base_delay_ms
            .saturating_mul(u64::from(state.failures.max(1)))
            .min(max_delay_ms);

        if state.failures >= policy.max_attempts {
            state.blocked_until = Some(now + policy.block_duration);
            state.failures = 0;
            state.window_started_at = now;

            return FailureAction {
                delay: Duration::from_millis(delay_ms),
                blocked_for: Some(policy.block_duration),
            };
        }

        FailureAction {
            delay: Duration::from_millis(delay_ms),
            blocked_for: None,
        }
    }

    fn maybe_cleanup(&mut self, now: tokio::time::Instant) {
        self.operation_count = self.operation_count.wrapping_add(1);
        if !self.operation_count.is_multiple_of(128) {
            return;
        }

        let retention = Duration::from_secs(60 * 60);
        self.login_attempts
            .retain(|_, state| now.duration_since(state.last_seen) <= retention);
        self.password_attempts
            .retain(|_, state| now.duration_since(state.last_seen) <= retention);
    }
}

// ============================================================================
// Middleware
// ============================================================================

/// Authentication middleware that checks:
/// 1. Session cookie (from login)
/// 2. `X-Api-Key` header
/// 3. `Authorization: Bearer <api_key>` header
/// 4. `?api_key=` query parameter (only if enabled in config)
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
    let allow_query_auth = state.config().read().await.server.allow_api_key_in_query;
    let allow_query_auth_for_request =
        allow_query_auth && is_query_auth_path_allowed(request.uri().path());
    let api_key = extract_api_key(&query, &headers, allow_query_auth_for_request);

    if let Some(key) = api_key {
        // Verify API key against service
        if let Ok(Some(username)) = state.auth_service().verify_api_key(&key).await {
            tracing::Span::current().record("user_id", &username);
            return Ok(next.run(request).await);
        }
    }

    let response = (StatusCode::UNAUTHORIZED, "Unauthorized");
    Ok(response.into_response())
}

/// Extract API key from query params or headers
fn extract_api_key(
    query: &AuthQuery,
    headers: &HeaderMap,
    allow_query_auth: bool,
) -> Option<String> {
    // Check query parameter (only if explicitly allowed)
    if allow_query_auth && let Some(ref api_key) = query.api_key {
        return Some(api_key.clone());
    }

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

fn is_query_auth_path_allowed(path: &str) -> bool {
    path.starts_with("/api/stream/")
        || path.starts_with("/stream/")
        || path == "/api/events"
        || path == "/events"
}

// ============================================================================
// Handlers
// ============================================================================

/// POST /auth/login
/// Authenticate with username and password, returns API key on success
pub async fn login(
    State(state): State<Arc<AppState>>,
    session: Session,
    headers: HeaderMap,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, ApiError> {
    // Validate input
    if payload.username.is_empty() {
        return Err(ApiError::validation("Username is required"));
    }
    if payload.password.is_empty() {
        return Err(ApiError::validation("Password is required"));
    }

    let throttle_config = {
        let config = state.config().read().await;
        config.security.auth_throttle.clone()
    };
    let client_id = client_identity(&headers, &throttle_config.trusted_proxy_ips);
    let rate_limit_key = format!("{client_id}:{}", payload.username.trim().to_lowercase());
    let login_policy = RateLimitPolicy::from_login_config(&throttle_config);

    if let Some(remaining) = {
        let mut limiter = state.auth_rate_limiter.lock().await;
        limiter.login_blocked_for(&rate_limit_key, login_policy)
    } {
        tracing::warn!(
            username = %payload.username,
            client_id = %client_id,
            wait_seconds = remaining.as_secs(),
            "Login temporarily blocked due to repeated failures"
        );
        return Err(ApiError::rate_limited(
            "Too many login attempts. Please try again shortly.",
        ));
    }

    let result = match state
        .auth_service()
        .login(&payload.username, &payload.password)
        .await
    {
        Ok(result) => {
            let mut limiter = state.auth_rate_limiter.lock().await;
            limiter.reset_login(&rate_limit_key);
            result
        }
        Err(
            crate::services::auth_service::AuthError::InvalidCredentials
            | crate::services::auth_service::AuthError::UserNotFound,
        ) => {
            let action = {
                let mut limiter = state.auth_rate_limiter.lock().await;
                limiter.record_login_failure(&rate_limit_key, login_policy)
            };

            tokio::time::sleep(action.delay).await;

            if let Some(blocked_for) = action.blocked_for {
                tracing::warn!(
                    username = %payload.username,
                    client_id = %client_id,
                    lockout_seconds = blocked_for.as_secs(),
                    "Login lockout triggered"
                );
            }

            return Err(ApiError::Unauthorized("Invalid credentials".to_string()));
        }
        Err(e) => return Err(ApiError::internal(format!("Authentication error: {e}"))),
    };

    // Create session
    if let Err(e) = session.insert("user", &result.username).await {
        return Err(ApiError::internal(format!("Failed to create session: {e}")));
    }

    Ok(Json(ApiResponse::success(result)))
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

    let user_info = state
        .auth_service()
        .get_user_info(&username)
        .await
        .map_err(|e| match e {
            crate::services::auth_service::AuthError::UserNotFound => {
                ApiError::Unauthorized("User not found".to_string())
            }
            _ => ApiError::internal(format!("Failed to get user info: {e}")),
        })?;

    Ok(Json(ApiResponse::success(user_info)))
}

/// PUT /auth/password
/// Change password (requires current password verification)
pub async fn change_password(
    State(state): State<Arc<AppState>>,
    session: Session,
    headers: HeaderMap,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<Json<ApiResponse<MessageResponse>>, ApiError> {
    let username = get_session_username(&session).await?;
    let throttle_config = {
        let config = state.config().read().await;
        config.security.auth_throttle.clone()
    };
    let client_id = client_identity(&headers, &throttle_config.trusted_proxy_ips);
    let rate_limit_key = format!("{client_id}:{}", username.to_lowercase());
    let password_policy = RateLimitPolicy::from_password_config(&throttle_config);

    if let Some(remaining) = {
        let mut limiter = state.auth_rate_limiter.lock().await;
        limiter.password_blocked_for(&rate_limit_key, password_policy)
    } {
        tracing::warn!(
            username = %username,
            client_id = %client_id,
            wait_seconds = remaining.as_secs(),
            "Password change temporarily blocked due to repeated failures"
        );
        return Err(ApiError::rate_limited(
            "Too many password attempts. Please try again shortly.",
        ));
    }

    match state
        .auth_service()
        .change_password(&username, &payload.current_password, &payload.new_password)
        .await
    {
        Ok(()) => {
            let mut limiter = state.auth_rate_limiter.lock().await;
            limiter.reset_password(&rate_limit_key);
        }
        Err(crate::services::auth_service::AuthError::IncorrectPassword) => {
            let action = {
                let mut limiter = state.auth_rate_limiter.lock().await;
                limiter.record_password_failure(&rate_limit_key, password_policy)
            };

            tokio::time::sleep(action.delay).await;

            if let Some(blocked_for) = action.blocked_for {
                tracing::warn!(
                    username = %username,
                    client_id = %client_id,
                    lockout_seconds = blocked_for.as_secs(),
                    "Password-change lockout triggered"
                );
                return Err(ApiError::rate_limited(
                    "Too many password attempts. Please try again shortly.",
                ));
            }

            return Err(ApiError::validation("Current password is incorrect"));
        }
        Err(crate::services::auth_service::AuthError::Validation(msg)) => {
            return Err(ApiError::validation(msg));
        }
        Err(e) => {
            return Err(ApiError::internal(format!(
                "Failed to update password: {e}"
            )));
        }
    }

    tracing::info!(username = %username, "Password changed for user");

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
        .auth_service()
        .get_api_key(&username)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to get API key: {e}")))?;

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
        .auth_service()
        .regenerate_api_key(&username)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to regenerate API key: {e}")))?;

    tracing::info!(username = %username, "API key regenerated for user");

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

/// Extract client identity for rate limiting.
///
/// WARNING: This function trusts `x-forwarded-for` and `x-real-ip` headers directly.
/// In production behind a reverse proxy, these headers can be spoofed unless
/// the proxy is configured to overwrite them and the proxy's IP is validated.
///
/// TODO(WS-M2): Add configuration option for trusted proxy IPs/networks.
/// When trusted proxies are configured, only accept forwarded headers from those IPs.
/// Fall back to socket peer address when no trusted proxy match.
fn client_identity(headers: &HeaderMap, trusted_proxy_ips: &[String]) -> String {
    let trusted_proxy = headers
        .get("x-forwarded-by")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .is_some_and(|proxy| trusted_proxy_ips.iter().any(|trusted| trusted == proxy));

    if trusted_proxy {
        if let Some(forwarded_for) = headers.get("x-forwarded-for")
            && let Ok(value) = forwarded_for.to_str()
            && let Some(first) = value.split(',').next()
        {
            let candidate = first.trim();
            if !candidate.is_empty() {
                return candidate.to_string();
            }
        }

        if let Some(real_ip) = headers.get("x-real-ip")
            && let Ok(value) = real_ip.to_str()
        {
            let candidate = value.trim();
            if !candidate.is_empty() {
                return candidate.to_string();
            }
        }
    }

    headers
        .get("x-remote-ip")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or_else(
            || "unknown-client".to_string(),
            std::string::ToString::to_string,
        )
}

#[cfg(test)]
mod tests {
    use super::client_identity;
    use axum::http::{HeaderMap, HeaderValue};

    #[test]
    fn ignores_forwarded_headers_without_trusted_proxy() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("1.2.3.4"));

        let id = client_identity(&headers, &[]);
        assert_eq!(id, "unknown-client");
    }

    #[test]
    fn uses_forwarded_for_from_trusted_proxy() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-by", HeaderValue::from_static("10.0.0.1"));
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("1.2.3.4, 5.6.7.8"),
        );

        let id = client_identity(&headers, &["10.0.0.1".to_string()]);
        assert_eq!(id, "1.2.3.4");
    }
}
