use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use tracing::debug;

use crate::api::NotificationEvent;
use crate::clients::nyaa::NyaaClient;
use crate::clients::qbittorrent::{QBitClient, QBitConfig};
use crate::clients::seadex::{SeaDexClient, SeaDexRelease};
use crate::config::Config;
use crate::db::Store;
use crate::library::RecycleBin;
use crate::services::{
    AutoDownloadService, DownloadDecisionService, EpisodeService, LibraryScannerService,
    LogService, RssService, SearchService,
};

#[derive(Clone)]
pub struct SharedState {
    pub config: Arc<RwLock<Config>>,

    pub store: Store,

    pub nyaa: Arc<NyaaClient>,

    pub seadex: Arc<SeaDexClient>,

    pub qbit: Option<Arc<QBitClient>>,

    pub search_service: Arc<SearchService>,

    pub rss_service: Arc<RssService>,

    pub log_service: Arc<LogService>,

    pub auto_downloader: Arc<AutoDownloadService>,

    pub library_scanner: Arc<LibraryScannerService>,

    pub episodes: EpisodeService,

    pub download_decisions: DownloadDecisionService,

    pub recycle_bin: RecycleBin,

    pub event_bus: broadcast::Sender<NotificationEvent>,
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

    async fn init_with_event_bus(
        config: Config,
        event_bus: broadcast::Sender<NotificationEvent>,
    ) -> anyhow::Result<Self> {
        let store = Store::new(&config.general.database_path).await?;
        store.initialize_quality_system(&config).await?;

        let nyaa = Arc::new(NyaaClient::with_timeout(std::time::Duration::from_secs(
            u64::from(config.nyaa.request_timeout_seconds),
        )));
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

        let episodes = EpisodeService::new(store.clone());
        let download_decisions = DownloadDecisionService::new(store.clone());

        let search_service = Arc::new(SearchService::new(
            store.clone(),
            (*nyaa).clone(),
            download_decisions.clone(),
            config.clone(),
        ));

        let rss_service = Arc::new(RssService::new(
            store.clone(),
            nyaa.clone(),
            qbit.clone(),
            event_bus.clone(),
        ));

        let log_service = Arc::new(LogService::new(store.clone(), event_bus.clone()));
        log_service.clone().start_listener();

        let recycle_bin = RecycleBin::new(
            &config.library.recycle_path,
            config.library.recycle_cleanup_days,
        );

        let config_arc = Arc::new(RwLock::new(config));

        let auto_downloader = Arc::new(AutoDownloadService::new(
            store.clone(),
            config_arc.clone(),
            search_service.clone(),
            seadex.clone(),
            qbit.clone(),
            recycle_bin.clone(),
        ));

        let library_scanner = Arc::new(LibraryScannerService::new(
            store.clone(),
            config_arc.clone(),
            event_bus.clone(),
        ));

        Ok(Self {
            config: config_arc,
            store,
            nyaa,
            seadex,
            qbit,
            search_service,
            rss_service,
            log_service,
            auto_downloader,
            library_scanner,
            episodes,
            download_decisions,
            recycle_bin,
            event_bus,
        })
    }

    pub async fn config(&self) -> Config {
        self.config.read().await.clone()
    }

    pub async fn get_seadex_groups_cached(&self, anime_id: i32) -> Vec<String> {
        if matches!(self.store.is_seadex_cache_fresh(anime_id).await, Ok(true))
            && let Ok(Some(cache)) = self.store.get_seadex_cache(anime_id).await
        {
            return cache.get_groups();
        }

        let config = self.config.read().await;
        if !config.downloads.use_seadex {
            return config.downloads.preferred_groups.clone();
        }
        drop(config);

        match self.seadex.get_best_for_anime(anime_id).await {
            Ok(releases) => {
                let groups: Vec<String> =
                    releases.iter().map(|r| r.release_group.clone()).collect();
                let best_release = releases.first().map(|r| r.release_group.as_str());

                if let Err(e) = self
                    .store
                    .cache_seadex(anime_id, &groups, best_release, &releases)
                    .await
                {
                    debug!("Failed to cache SeaDex results: {}", e);
                }

                groups
            }
            Err(e) => {
                debug!("SeaDex lookup failed: {}", e);
                self.config.read().await.downloads.preferred_groups.clone()
            }
        }
    }

    pub async fn get_seadex_releases_cached(&self, anime_id: i32) -> Vec<SeaDexRelease> {
        if matches!(self.store.is_seadex_cache_fresh(anime_id).await, Ok(true))
            && let Ok(Some(cache)) = self.store.get_seadex_cache(anime_id).await
        {
            let releases = cache.get_releases();
            if !releases.is_empty() {
                return releases;
            }
        }

        let config = self.config.read().await;
        if !config.downloads.use_seadex {
            return vec![];
        }
        drop(config);

        match self.seadex.get_best_for_anime(anime_id).await {
            Ok(releases) => {
                let groups: Vec<String> =
                    releases.iter().map(|r| r.release_group.clone()).collect();
                let best_release = releases.first().map(|r| r.release_group.as_str());

                if let Err(e) = self
                    .store
                    .cache_seadex(anime_id, &groups, best_release, &releases)
                    .await
                {
                    debug!("Failed to cache SeaDex releases: {}", e);
                }

                releases
            }
            Err(e) => {
                debug!("SeaDex lookup failed: {}", e);
                vec![]
            }
        }
    }

    #[must_use]
    pub fn is_from_seadex_group(&self, title: &str, seadex_groups: &[String]) -> bool {
        if seadex_groups.is_empty() {
            return false;
        }
        let title_lower = title.to_lowercase();
        seadex_groups
            .iter()
            .any(|g| title_lower.contains(&g.to_lowercase()))
    }
}
