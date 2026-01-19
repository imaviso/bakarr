use crate::api::AppState;
use axum::{extract::State, response::IntoResponse};
use std::sync::Arc;

pub async fn get_metrics(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    if let Some(handle) = &state.prometheus_handle {
        handle.render()
    } else {
        "Metrics not enabled or failed to initialize".to_string()
    }
}

use axum::{extract::Request, middleware::Next, response::Response};
use std::time::Instant;

pub async fn track_metrics(req: Request, next: Next) -> Response {
    let start = Instant::now();
    let path = if let Some(matched_path) = req.extensions().get::<axum::extract::MatchedPath>() {
        matched_path.as_str().to_string()
    } else {
        req.uri().path().to_string()
    };
    let method = req.method().clone();

    let response = next.run(req).await;

    let latency = start.elapsed().as_secs_f64();
    let status = response.status().as_u16().to_string();

    let labels = [
        ("method", method.to_string()),
        ("path", path),
        ("status", status),
    ];

    metrics::counter!("http_requests_total", &labels).increment(1);
    metrics::histogram!("http_request_duration_seconds", &labels).record(latency);

    response
}
