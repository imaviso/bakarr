use crate::clients::seadex::{SeaDexClient, SeaDexRelease};
use crate::config::Config;
use crate::db::Store;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::debug;

/// Service for handling `SeaDex` operations with caching.
/// Consolidates all `SeaDex`-related logic to avoid duplication.
pub struct SeaDexService {
    store: Store,
    config: Arc<RwLock<Config>>,
    client: Arc<SeaDexClient>,
}

impl SeaDexService {
    #[must_use]
    pub const fn new(store: Store, config: Arc<RwLock<Config>>, client: Arc<SeaDexClient>) -> Self {
        Self {
            store,
            config,
            client,
        }
    }

    /// Get cached `SeaDex` groups for an anime.
    /// Returns preferred groups from config if `SeaDex` is disabled or lookup fails.
    pub async fn get_groups(&self, anime_id: i32) -> Vec<String> {
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

        match self.client.get_best_for_anime(anime_id).await {
            Ok(releases) => {
                let groups: Vec<String> =
                    releases.iter().map(|r| r.release_group.clone()).collect();
                let best_release = releases.first().map(|r| r.release_group.as_str());

                if let Err(e) = self
                    .store
                    .cache_seadex(anime_id, &groups, best_release, &releases)
                    .await
                {
                    debug!(error = %e, "Failed to cache SeaDex results: ");
                }

                groups
            }
            Err(e) => {
                debug!(error = %e, "SeaDex lookup failed: ");
                self.config.read().await.downloads.preferred_groups.clone()
            }
        }
    }

    /// Get cached `SeaDex` releases for an anime.
    /// Returns empty vec if `SeaDex` is disabled or lookup fails.
    pub async fn get_releases(&self, anime_id: i32) -> Vec<SeaDexRelease> {
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

        match self.client.get_best_for_anime(anime_id).await {
            Ok(releases) => {
                let groups: Vec<String> =
                    releases.iter().map(|r| r.release_group.clone()).collect();
                let best_release = releases.first().map(|r| r.release_group.as_str());

                if let Err(e) = self
                    .store
                    .cache_seadex(anime_id, &groups, best_release, &releases)
                    .await
                {
                    debug!(error = %e, "Failed to cache SeaDex releases: ");
                }

                releases
            }
            Err(e) => {
                debug!(error = %e, "SeaDex lookup failed: ");
                vec![]
            }
        }
    }

    /// Check if a release title matches any `SeaDex` group.
    #[must_use]
    pub fn is_seadex_release(&self, title: &str, seadex_groups: &[String]) -> bool {
        if seadex_groups.is_empty() {
            return false;
        }
        let title_lower = title.to_lowercase();
        seadex_groups
            .iter()
            .any(|g| title_lower.contains(&g.to_lowercase()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_service() -> SeaDexService {
        let db_path =
            std::env::temp_dir().join(format!("bakarr-seadex-test-{}.db", uuid::Uuid::new_v4()));

        let mut config = Config::default();
        config.general.database_path = format!("sqlite:{}", db_path.display());
        config.qbittorrent.enabled = false;

        let state = crate::api::create_app_state_from_config(config, None)
            .await
            .expect("create app state");

        SeaDexService::new(
            state.store().clone(),
            state.config().clone(),
            Arc::new(SeaDexClient::new()),
        )
    }

    #[tokio::test]
    async fn is_seadex_release_matches_case_insensitively() {
        let service = test_service().await;
        let groups = vec!["SubsPlease".to_string()];
        assert!(service.is_seadex_release("[subsplease] Example", &groups));
    }

    #[tokio::test]
    async fn is_seadex_release_returns_false_for_empty_groups() {
        let service = test_service().await;
        assert!(!service.is_seadex_release("[SubsPlease] Example", &[]));
    }
}
