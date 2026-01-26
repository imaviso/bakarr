use axum::{
    Router,
    http::HeaderValue,
    middleware,
    routing::{delete, get, post, put},
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tower_sessions::{Expiry, MemoryStore, SessionManagerLayer};

use time;

use crate::clients::offline_db::OfflineDatabase;
use crate::config::Config;
use crate::state::SharedState;

mod anime;
mod assets;
pub mod auth;
pub mod calendar;
pub mod downloads;
pub mod episodes;
mod error;
pub mod events;
mod import;
mod library;
mod observability;
mod profiles;
mod release_profiles;
mod rename;
mod rss;
mod search;
mod stream;
mod system;
mod tasks;
mod types;
mod validation;
pub mod wanted;

pub use error::ApiError;
pub use types::*;

use tokio::sync::RwLock;

pub use events::NotificationEvent;

use crate::services::AnimeMetadataService;
use crate::services::ImageService;
use crate::services::LibraryScannerService;
use crate::services::RssService;
use metrics_exporter_prometheus::PrometheusHandle;

#[derive(Clone)]
pub struct AppState {
    pub shared: Arc<SharedState>,

    pub image_service: Arc<ImageService>,

    pub offline_db: Arc<OfflineDatabase>,

    pub metadata_service: Arc<AnimeMetadataService>,

    pub rss_service: Arc<RssService>,

    pub library_scanner: Arc<LibraryScannerService>,

    pub start_time: std::time::Instant,

    pub prometheus_handle: Option<PrometheusHandle>,
}

impl AppState {
    #[must_use]
    pub fn config(&self) -> &Arc<RwLock<Config>> {
        &self.shared.config
    }

    #[must_use]
    pub fn store(&self) -> &crate::db::Store {
        &self.shared.store
    }

    #[must_use]
    pub fn event_bus(&self) -> &tokio::sync::broadcast::Sender<NotificationEvent> {
        &self.shared.event_bus
    }

    #[must_use]
    pub fn search_service(&self) -> &Arc<crate::services::SearchService> {
        &self.shared.search_service
    }

    #[must_use]
    pub fn nyaa(&self) -> &Arc<crate::clients::nyaa::NyaaClient> {
        &self.shared.nyaa
    }

    #[must_use]
    pub fn seadex(&self) -> &Arc<crate::clients::seadex::SeaDexClient> {
        &self.shared.seadex
    }

    #[must_use]
    pub fn qbit(&self) -> &Option<Arc<crate::clients::qbittorrent::QBitClient>> {
        &self.shared.qbit
    }
}

pub async fn create_app_state(
    shared: Arc<SharedState>,
    prometheus_handle: Option<PrometheusHandle>,
) -> anyhow::Result<Arc<AppState>> {
    let config = shared.config.read().await.clone();

    let image_service = Arc::new(ImageService::new(config.clone()));

    let offline_db = Arc::new(
        OfflineDatabase::load()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to load offline db: {e}"))?,
    );

    let metadata_service = Arc::new(AnimeMetadataService::new(offline_db.clone()));

    let library_scanner = shared.library_scanner.clone();

    let rss_service = Arc::new(RssService::new(
        shared.store.clone(),
        shared.nyaa.clone(),
        shared.qbit.clone(),
        shared.event_bus.clone(),
    ));

    Ok(Arc::new(AppState {
        shared,
        image_service,
        offline_db,
        metadata_service,
        rss_service,
        library_scanner,
        start_time: std::time::Instant::now(),
        prometheus_handle,
    }))
}

pub async fn create_app_state_from_config(
    config: Config,
    prometheus_handle: Option<PrometheusHandle>,
) -> anyhow::Result<Arc<AppState>> {
    let shared = Arc::new(SharedState::new(config).await?);
    create_app_state(shared, prometheus_handle).await
}

pub async fn router(state: Arc<AppState>) -> Router {
    let (images_path, cors_origins) = {
        let config = state.config().read().await;
        (
            config.general.images_path.clone(),
            config.server.cors_allowed_origins.clone(),
        )
    };

    let protected_routes = create_protected_router(state.clone());

    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(time::Duration::minutes(60)));

    let api_router = Router::new()
        .merge(protected_routes)
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/stream/{id}/{number}", get(stream::stream_episode))
        .layer(session_layer)
        .with_state(state.clone());

    let cors_layer = if cors_origins.contains(&"*".to_string()) {
        CorsLayer::new().allow_origin(Any)
    } else {
        let origins: Vec<HeaderValue> =
            cors_origins.iter().filter_map(|s| s.parse().ok()).collect();
        CorsLayer::new().allow_origin(origins)
    };

    Router::new()
        .nest("/api", api_router)
        .nest_service("/images", tower_http::services::ServeDir::new(images_path))
        .fallback(assets::serve_asset)
        .layer(cors_layer.allow_methods(Any).allow_headers(Any))
        .layer(TraceLayer::new_for_http())
        .layer(middleware::from_fn(observability::track_metrics))
}

fn create_protected_router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/anime", get(anime::list_anime))
        .route("/anime/search", get(anime::search_anime))
        .route("/anime", post(anime::add_anime))
        .route("/anime/{id}", get(anime::get_anime))
        .route("/anime/{id}", delete(anime::remove_anime))
        .route("/anime/{id}/monitor", post(anime::toggle_monitor))
        .route("/anime/{id}/path", put(anime::update_anime_path))
        .route("/anime/{id}/profile", put(anime::update_anime_profile))
        .route(
            "/anime/{id}/rename-preview",
            get(rename::get_rename_preview),
        )
        .route("/anime/{id}/rename", post(rename::execute_rename))
        .route("/anime/{id}/episodes", get(episodes::list_episodes))
        .route(
            "/anime/{id}/episodes/missing",
            get(episodes::missing_episodes),
        )
        .route("/anime/{id}/episodes/{number}", get(episodes::get_episode))
        .route(
            "/anime/{id}/episodes/refresh",
            post(episodes::refresh_metadata),
        )
        .route("/anime/{id}/episodes/scan", post(episodes::scan_folder))
        .route("/anime/{id}/files", get(episodes::list_files))
        .route(
            "/anime/{id}/episodes/{number}/map",
            post(episodes::map_episode_file),
        )
        .route(
            "/anime/{id}/episodes/map/bulk",
            post(episodes::bulk_map_episodes),
        )
        .route(
            "/anime/{id}/episodes/{number}/file",
            delete(episodes::delete_episode_file),
        )
        .route("/downloads/history", get(downloads::get_history))
        .route("/downloads/queue", get(downloads::get_queue))
        .route("/downloads/search-missing", post(downloads::search_missing))
        .route("/wanted/missing", get(wanted::list_missing))
        .route("/calendar", get(calendar::get_calendar))
        .route("/profiles", get(profiles::list_profiles))
        .route("/profiles/qualities", get(profiles::list_qualities))
        .route("/profiles/{name}", get(profiles::get_profile))
        .route("/profiles", post(profiles::create_profile))
        .route("/profiles/{name}", put(profiles::update_profile))
        .route("/profiles/{name}", delete(profiles::delete_profile))
        .route(
            "/release-profiles",
            get(release_profiles::list_release_profiles),
        )
        .route(
            "/release-profiles",
            post(release_profiles::create_release_profile),
        )
        .route(
            "/release-profiles/{id}",
            put(release_profiles::update_release_profile),
        )
        .route(
            "/release-profiles/{id}",
            delete(release_profiles::delete_release_profile),
        )
        .route("/rss", get(rss::list_feeds))
        .route("/rss", post(rss::add_feed))
        .route("/rss/{id}", delete(rss::delete_feed))
        .route("/rss/{id}/toggle", put(rss::toggle_feed))
        .route("/anime/{id}/rss", get(rss::get_feeds_for_anime))
        .route("/library/stats", get(library::get_stats))
        .route("/library/activity", get(library::get_activity))
        .route("/library/unmapped", get(library::get_unmapped_folders))
        .route("/library/unmapped/scan", post(library::scan_library))
        .route("/library/unmapped/import", post(library::import_folder))
        .route("/library/import/scan", post(import::scan_path))
        .route("/library/import", post(import::import_files))
        .route("/library/browse", get(import::browse_path))
        .route("/search/releases", get(search::search_releases))
        .route(
            "/search/episode/{anime_id}/{episode_number}",
            get(search::search_episode),
        )
        .route("/search/download", post(search::download_release))
        .route("/system/status", get(system::get_status))
        .route("/system/config", get(system::get_config))
        .route("/system/config", put(system::update_config))
        .route("/system/tasks/scan", post(tasks::trigger_scan))
        .route("/system/tasks/rss", post(tasks::trigger_rss_check))
        .route("/system/logs", get(system::get_logs))
        .route("/system/logs/export", get(system::logs::export_logs))
        .route("/system/logs", delete(system::clear_logs))
        .route("/metrics", get(observability::get_metrics))
        .merge(events::router())
        .route_layer(middleware::from_fn_with_state(state, auth::auth_middleware))
}
