use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};

use crate::api::NotificationEvent;
use crate::clients::anilist::AnilistClient;
use crate::clients::jikan::JikanClient;
use crate::clients::nyaa::NyaaClient;
use crate::clients::offline_db::OfflineDatabase;
use crate::clients::qbittorrent::{QBitClient, QBitConfig};
use crate::clients::seadex::{SeaDexClient, SeaDexRelease};
use crate::config::Config;
use crate::db::Store;
use crate::library::RecycleBin;
use crate::services::SeaDexService;
use crate::services::episodes::EpisodeService as OldEpisodeService;
use crate::services::{
    AnimeMetadataService, AnimeService, AutoDownloadService, DownloadDecisionService,
    DownloadService, EpisodeService, ImageService, LibraryScannerService, LibraryService,
    LogService, RssService, SeaOrmAnimeService, SeaOrmDownloadService, SeaOrmEpisodeService,
    SeaOrmLibraryService, SearchService,
};

/// Build a shared HTTP client with reasonable defaults for API calls.
/// This client should be reused across all HTTP-based services to enable
/// connection pooling and avoid socket exhaustion.
fn build_shared_http_client(timeout_seconds: u64) -> anyhow::Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_seconds))
        .user_agent("Bakarr/1.0")
        .pool_max_idle_per_host(10)
        .build()
        .map_err(|e| anyhow::anyhow!("Failed to build shared HTTP client: {e}"))
}

#[derive(Clone)]
pub struct SharedState {
    pub config: Arc<RwLock<Config>>,

    pub store: Store,

    pub nyaa: Arc<NyaaClient>,

    pub anilist: Arc<AnilistClient>,

    pub jikan: Arc<JikanClient>,

    pub seadex_service: Arc<SeaDexService>,

    pub qbit: Option<Arc<QBitClient>>,

    pub search_service: Arc<SearchService>,

    pub rss_service: Arc<RssService>,

    pub log_service: Arc<LogService>,

    pub auto_downloader: Arc<AutoDownloadService>,

    pub library_scanner: Arc<LibraryScannerService>,

    pub episodes: OldEpisodeService,

    pub episode_service: Arc<dyn EpisodeService>,

    pub download_service: Arc<dyn DownloadService>,

    pub download_decisions: DownloadDecisionService,

    pub recycle_bin: RecycleBin,

    pub event_bus: broadcast::Sender<NotificationEvent>,

    pub anime_service: Arc<dyn AnimeService>,

    pub image_service: Arc<ImageService>,

    pub offline_db: Arc<OfflineDatabase>,

    pub metadata_service: Arc<AnimeMetadataService>,

    pub library_service: Arc<dyn LibraryService>,
}

impl SharedState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let (event_bus, _) = broadcast::channel(config.general.event_bus_buffer_size);
        Self::init_with_event_bus(config, event_bus).await
    }

    pub async fn with_event_bus(
        config: Config,
        event_bus: broadcast::Sender<NotificationEvent>,
    ) -> anyhow::Result<Self> {
        Self::init_with_event_bus(config, event_bus).await
    }

    #[allow(clippy::too_many_lines)]
    async fn init_with_event_bus(
        config: Config,
        event_bus: broadcast::Sender<NotificationEvent>,
    ) -> anyhow::Result<Self> {
        let store = Store::with_pool_options(
            &config.general.database_path,
            config.general.max_db_connections,
            config.general.min_db_connections,
        )
        .await?;
        store.initialize_quality_system(&config).await?;

        // Create a shared HTTP client for all services that need HTTP capabilities.
        // This enables connection pooling and avoids socket exhaustion.
        let http_client = build_shared_http_client(config.nyaa.request_timeout_seconds.into())?;

        let nyaa = Arc::new(NyaaClient::with_shared_client(http_client.clone()));
        let anilist = Arc::new(AnilistClient::with_shared_client(http_client));
        let jikan = Arc::new(JikanClient::new());
        let seadex_client = Arc::new(SeaDexClient::new());

        let qbit = if config.qbittorrent.enabled {
            let qbit_config = QBitConfig {
                base_url: config.qbittorrent.url.clone(),
                username: config.qbittorrent.username.clone(),
                password: config.qbittorrent.password.clone(),
            };
            Some(Arc::new(QBitClient::new(qbit_config)?))
        } else {
            None
        };

        // Clone config before moving it into the RwLock for services that need it
        let image_service_config = config.clone();
        let config_arc = Arc::new(RwLock::new(config));

        let episodes = OldEpisodeService::new(store.clone(), jikan.clone(), anilist.clone(), None);
        let download_decisions = DownloadDecisionService::new(store.clone());

        // Create seadex_service first since search_service depends on it
        let seadex_service = Arc::new(SeaDexService::new(
            store.clone(),
            config_arc.clone(),
            seadex_client,
        ));

        let search_service = Arc::new(SearchService::new(
            store.clone(),
            (*nyaa).clone(),
            download_decisions.clone(),
            config_arc.read().await.clone(),
            seadex_service.clone(),
        ));

        let rss_service = Arc::new(RssService::new(
            store.clone(),
            nyaa.clone(),
            qbit.clone(),
            download_decisions.clone(),
            event_bus.clone(),
        ));

        let log_service = Arc::new(LogService::new(store.clone(), event_bus.clone()));
        log_service.clone().start_listener();

        let recycle_bin = RecycleBin::new(
            &config_arc.read().await.library.recycle_path,
            config_arc.read().await.library.recycle_cleanup_days,
        );

        let auto_downloader = Arc::new(AutoDownloadService::new(
            store.clone(),
            config_arc.clone(),
            search_service.clone(),
            seadex_service.clone(),
            qbit.clone(),
            recycle_bin.clone(),
        ));

        let library_scanner = Arc::new(LibraryScannerService::new(
            store.clone(),
            config_arc.clone(),
            event_bus.clone(),
        ));

        // Create services needed by AnimeService
        let image_service = Arc::new(ImageService::new(image_service_config));
        let offline_db = Arc::new(OfflineDatabase::new(store.clone()));
        offline_db
            .initialize()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to initialize offline db: {e}"))?;
        let metadata_service = Arc::new(AnimeMetadataService::new(offline_db.clone()));

        let store_arc = Arc::new(store.clone());
        let anime_service = Arc::new(SeaOrmAnimeService::new(
            store_arc.clone(),
            anilist.clone(),
            image_service.clone(),
            metadata_service.clone(),
            config_arc.clone(),
        )) as Arc<dyn AnimeService + Send + Sync + 'static>;

        // Create the new EpisodeService
        let episode_service = Arc::new(SeaOrmEpisodeService::new(
            store_arc,
            anilist.clone(),
            jikan.clone(),
            None, // kitsu - optional
            image_service.clone(),
            config_arc.clone(),
            event_bus.clone(),
        )) as Arc<dyn EpisodeService + Send + Sync + 'static>;

        // Create the DownloadService
        let download_service = Arc::new(SeaOrmDownloadService::new(
            store.clone(),
            config_arc.clone(),
            search_service.clone(),
            event_bus.clone(),
        )) as Arc<dyn DownloadService + Send + Sync + 'static>;

        // Create the LibraryService
        let library_service = Arc::new(SeaOrmLibraryService::new(
            store.clone(),
            config_arc.clone(),
            anilist.clone(),
            library_scanner.clone(),
            metadata_service.clone(),
            image_service.clone(),
            event_bus.clone(),
        )) as Arc<dyn LibraryService + Send + Sync + 'static>;

        Ok(Self {
            config: config_arc,
            store,
            nyaa,
            anilist,
            jikan,
            seadex_service,
            qbit,
            search_service,
            rss_service,
            log_service,
            auto_downloader,
            library_scanner,
            episodes,
            episode_service,
            download_service,
            download_decisions,
            recycle_bin,
            event_bus,
            anime_service,
            image_service,
            offline_db,
            metadata_service,
            library_service,
        })
    }

    pub async fn config(&self) -> Config {
        self.config.read().await.clone()
    }

    /// Delegates to `SeaDexService` for cached groups lookup.
    pub async fn get_seadex_groups_cached(&self, anime_id: i32) -> Vec<String> {
        self.seadex_service.get_groups(anime_id).await
    }

    /// Delegates to `SeaDexService` for cached releases lookup.
    pub async fn get_seadex_releases_cached(&self, anime_id: i32) -> Vec<SeaDexRelease> {
        self.seadex_service.get_releases(anime_id).await
    }

    /// Delegates to `SeaDexService` for checking if a title is from a `SeaDex` group.
    #[must_use]
    pub fn is_from_seadex_group(&self, title: &str, seadex_groups: &[String]) -> bool {
        self.seadex_service.is_seadex_release(title, seadex_groups)
    }
}
