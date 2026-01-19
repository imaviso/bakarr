use axum::{
    body::Body,
    http::{StatusCode, Uri, header},
    response::IntoResponse,
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "bakarr-ui/dist"]
struct Asset;

pub async fn serve_asset(uri: Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();

    if path.is_empty() {
        path = "index.html".to_string();
    }

    match Asset::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                [(header::CONTENT_TYPE, mime.as_ref())],
                Body::from(content.data),
            )
                .into_response()
        }
        None => {
            if let Some(content) = Asset::get("index.html") {
                let mime = mime_guess::from_path("index.html").first_or_octet_stream();
                (
                    [(header::CONTENT_TYPE, mime.as_ref())],
                    Body::from(content.data),
                )
                    .into_response()
            } else {
                (StatusCode::NOT_FOUND, "404 Not Found").into_response()
            }
        }
    }
}
