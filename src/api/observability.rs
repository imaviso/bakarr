use crate::api::AppState;
use axum::{extract::State, http::HeaderValue, response::IntoResponse};
use std::sync::Arc;

pub async fn get_metrics(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    state.prometheus_handle.as_ref().map_or_else(
        || "Metrics not enabled or failed to initialize".to_string(),
        metrics_exporter_prometheus::PrometheusHandle::render,
    )
}

use axum::{extract::Request, middleware::Next, response::Response};
use std::time::Instant;
use tracing::{Instrument, info, info_span};
use uuid::Uuid;

pub async fn logging_middleware(req: Request, next: Next) -> Response {
    let start = Instant::now();
    let request_id = Uuid::new_v4().to_string();

    let method = req.method().to_string();
    let uri = req.uri().path().to_string();

    let matched_path = req
        .extensions()
        .get::<axum::extract::MatchedPath>()
        .map(|mp| mp.as_str().to_string());

    let user_agent = req
        .headers()
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let matched_path_span = matched_path.clone();

    let span = info_span!(
        "request",
        request_id = %request_id,
        method = %method,
        path = %uri,
        route = matched_path_span,
        user_id = tracing::field::Empty,
    );

    async move {
        let response = next.run(req).await;

        let duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
        let status = response.status().as_u16();

        let outcome = if status >= 500 {
            "error"
        } else if status >= 400 {
            "client_error"
        } else {
            "success"
        };

        // Metrics
        // Use matched_path if available to avoid cardinality explosion
        let metrics_path = matched_path.as_deref().unwrap_or(&uri);

        let labels = [
            ("method", method.clone()),
            ("path", metrics_path.to_string()),
            ("status", status.to_string()),
        ];

        metrics::counter!("http_requests_total", &labels).increment(1);
        metrics::histogram!("http_request_duration_seconds", &labels)
            .record(start.elapsed().as_secs_f64());

        // Wide Event
        info!(
            event = "http_request_finished",
            duration_ms = duration_ms,
            status_code = status,
            user_agent = %user_agent,
            outcome = %outcome,
            "Request finished"
        );

        response
    }
    .instrument(span)
    .await
}

pub async fn security_headers_middleware(req: Request, next: Next) -> Response {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();

    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    headers.insert(
        "referrer-policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        "content-security-policy",
        HeaderValue::from_static(
            "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'",
        ),
    );

    response
}
