use axum::{
    Router, middleware,
    routing::{delete, get, post, put},
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tower_sessions::{Expiry, MemoryStore, SessionManagerLayer};

use time;

use crate::clients::offline_db::OfflineDatabase;
use crate::config::Config;
use crate::db::Store;

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
mod rename;
mod rss;
mod search;
mod stream;
mod system;
mod tasks;
mod types;
mod validation;

pub use error::ApiError;
pub use types::*;

use tokio::sync::{RwLock, broadcast};

pub use events::NotificationEvent;

use crate::clients::nyaa::NyaaClient;
use crate::clients::qbittorrent::{QBitClient, QBitConfig};
use crate::clients::seadex::SeaDexClient;
use crate::services::AnimeMetadataService;
use crate::services::DownloadDecisionService;
use crate::services::ImageService;
use crate::services::LibraryScannerService;
use crate::services::RssService;
use crate::services::SearchService;
use metrics_exporter_prometheus::PrometheusHandle;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<Config>>,
    pub store: Store,
    pub image_service: Arc<ImageService>,
    pub offline_db: Arc<OfflineDatabase>,
    pub metadata_service: Arc<AnimeMetadataService>,
    pub search_service: Arc<SearchService>,
    pub rss_service: Arc<RssService>,
    pub nyaa: Arc<NyaaClient>,
    pub seadex: Arc<SeaDexClient>,
    pub qbit: Option<Arc<QBitClient>>,
    pub library_scanner: Arc<LibraryScannerService>,
    pub event_bus: broadcast::Sender<NotificationEvent>,
    pub start_time: std::time::Instant,
    pub prometheus_handle: Option<PrometheusHandle>,
}

pub async fn create_app_state(
    config: Config,
    prometheus_handle: Option<PrometheusHandle>,
) -> anyhow::Result<Arc<AppState>> {
    let store = Store::new(&config.general.database_path).await?;
    store.initialize_quality_system(&config).await?;
    let image_service = Arc::new(ImageService::new(config.clone()));
    let (event_bus, _) = broadcast::channel(100);

    let nyaa = Arc::new(NyaaClient::new());
    let seadex = Arc::new(SeaDexClient::new());

    let qbit = if config.qbittorrent.enabled {
        let qbit_config = QBitConfig {
            base_url: config.qbittorrent.url.clone(),
            username: config.qbittorrent.username.clone(),
            password: config.qbittorrent.password.clone(),
        };
        Some(Arc::new(QBitClient::new(qbit_config)))
    } else {
        None
    };

    let offline_db = Arc::new(
        OfflineDatabase::load()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to load offline db: {}", e))?,
    );

    let metadata_service = Arc::new(AnimeMetadataService::new(offline_db.clone()));

    let download_decisions = DownloadDecisionService::new(store.clone());
    let search_service = Arc::new(SearchService::new(
        store.clone(),
        (*nyaa).clone(),
        (*seadex).clone(),
        download_decisions,
        config.clone(),
    ));

    let library_scanner = Arc::new(LibraryScannerService::new(
        store.clone(),
        Arc::new(RwLock::new(config.clone())),
        event_bus.clone(),
    ));

    let rss_service = Arc::new(RssService::new(
        store.clone(),
        nyaa.clone(),
        qbit.clone(),
        event_bus.clone(),
    ));

    Ok(Arc::new(AppState {
        config: Arc::new(RwLock::new(config)),
        store,
        image_service,
        offline_db,
        metadata_service,
        search_service,
        rss_service,
        nyaa,
        seadex,
        qbit,
        library_scanner,
        event_bus,
        start_time: std::time::Instant::now(),
        prometheus_handle,
    }))
}

pub fn router(state: Arc<AppState>) -> Router {
    let images_path = state
        .config
        .try_read()
        .map(|c| c.general.images_path.clone())
        .unwrap_or_else(|_| "images".to_string());

    let protected_routes = Router::new()
        .route("/anime", get(anime::list_anime))
        .route("/anime/search", get(anime::search_anime))
        .route("/anime", post(anime::add_anime))
        .route("/anime/{id}", get(anime::get_anime))
        .route("/anime/{id}", delete(anime::remove_anime))
        .route("/anime/{id}/monitor", post(anime::toggle_monitor))
        .route("/anime/{id}/path", put(anime::update_anime_path))
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
        .route("/calendar", get(calendar::get_calendar))
        .route("/profiles", get(profiles::list_profiles))
        .route("/profiles/{name}", get(profiles::get_profile))
        .route("/profiles", post(profiles::create_profile))
        .route("/profiles/{name}", put(profiles::update_profile))
        .route("/profiles/{name}", delete(profiles::delete_profile))
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
        .route("/metrics", get(observability::get_metrics))
        .merge(events::router())
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ));

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

    Router::new()
        .nest("/api", api_router)
        .nest_service("/images", tower_http::services::ServeDir::new(images_path))
        .fallback(assets::serve_asset)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .layer(middleware::from_fn(observability::track_metrics))
}
