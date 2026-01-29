use crate::clients::anilist::AnilistClient;
use crate::clients::jikan::JikanClient;
use crate::clients::kitsu::KitsuClient;
use crate::clients::offline_db::OfflineDatabase;
use crate::db::Store;
use crate::entities::episode_metadata::Model as EpisodeMetadata;
use crate::models::episode::EpisodeInput;
use anyhow::Result;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

#[derive(Clone)]
pub struct EpisodeService {
    jikan: Arc<JikanClient>,
    anilist: Arc<AnilistClient>,
    kitsu: Arc<KitsuClient>,
    offline_db: OfflineDatabase,
    store: Store,

    recent_fetches: Arc<std::sync::RwLock<HashMap<i32, Instant>>>,
}

impl EpisodeService {
    #[must_use]
    pub fn new(
        store: Store,
        jikan: Arc<JikanClient>,
        anilist: Arc<AnilistClient>,
        kitsu: Option<Arc<KitsuClient>>,
    ) -> Self {
        Self {
            jikan,
            anilist,
            kitsu: kitsu.unwrap_or_else(|| Arc::new(KitsuClient::new())),
            offline_db: OfflineDatabase::new(store.clone()),
            store,
            recent_fetches: Arc::new(std::sync::RwLock::new(HashMap::new())),
        }
    }

    async fn get_mal_id(&self, anilist_id: i32) -> Option<i32> {
        self.offline_db
            .anilist_to_mal(anilist_id)
            .await
            .unwrap_or(None)
    }

    async fn get_kitsu_id(&self, anilist_id: i32) -> Option<i32> {
        self.offline_db
            .anilist_to_kitsu(anilist_id)
            .await
            .unwrap_or(None)
    }

    pub async fn get_episode_title(&self, anilist_id: i32, episode_number: i32) -> Result<String> {
        if let Some(title) = self
            .store
            .get_episode_title(anilist_id, episode_number)
            .await?
        {
            debug!("Episode title from cache: {}", title);
            return Ok(title);
        }

        if let Err(e) = self.fetch_and_cache_episodes(anilist_id).await {
            warn!(error = %e, "Failed to fetch episodes from external providers");
        }

        if let Some(title) = self
            .store
            .get_episode_title(anilist_id, episode_number)
            .await?
        {
            return Ok(title);
        }

        Ok(format!("Episode {episode_number}"))
    }

    pub async fn get_episode_metadata(
        &self,
        anilist_id: i32,
        episode_number: i32,
    ) -> Result<Option<EpisodeMetadata>> {
        if let Some(meta) = self
            .store
            .get_episode_metadata(anilist_id, episode_number)
            .await?
        {
            return Ok(Some(meta));
        }

        if let Err(e) = self.fetch_and_cache_episodes(anilist_id).await {
            warn!(error = %e, "Failed to fetch episodes from external providers");
            return Ok(None);
        }

        self.store
            .get_episode_metadata(anilist_id, episode_number)
            .await
    }

    pub async fn fetch_and_cache_episodes(&self, anilist_id: i32) -> Result<usize> {
        if let Ok(guard) = self.recent_fetches.read()
            && let Some(&last_fetch) = guard.get(&anilist_id)
            && last_fetch.elapsed() < Duration::from_secs(300)
        {
            debug!(
                "Skipping fetch for anime {} due to recent attempt",
                anilist_id
            );
            return Ok(0);
        }

        if let Ok(mut guard) = self.recent_fetches.write() {
            guard.insert(anilist_id, Instant::now());
        }

        // Try AniList first
        match self.fetch_from_anilist(anilist_id).await {
            Ok(eps) if !eps.is_empty() => {
                let count = eps.len();
                self.store.cache_episodes(anilist_id, &eps).await?;
                info!(
                    "Cached {} episodes from AniList for ID {}",
                    count, anilist_id
                );
                return Ok(count);
            }
            Ok(_) => debug!("AniList returned 0 episodes for ID {}", anilist_id),
            Err(e) => warn!(anilist_id, error = %e, "Failed to fetch from AniList"),
        }

        // Try Kitsu second
        match self.fetch_from_kitsu(anilist_id).await {
            Ok(eps) if !eps.is_empty() => {
                let count = eps.len();
                self.store.cache_episodes(anilist_id, &eps).await?;
                info!("Cached {} episodes from Kitsu for ID {}", count, anilist_id);
                return Ok(count);
            }
            Ok(_) => debug!("Kitsu returned 0 episodes for ID {}", anilist_id),
            Err(e) => warn!(anilist_id, error = %e, "Failed to fetch from Kitsu"),
        }

        // Try Jikan last
        match self.fetch_from_jikan(anilist_id).await {
            Ok(eps) if !eps.is_empty() => {
                let count = eps.len();
                self.store.cache_episodes(anilist_id, &eps).await?;
                info!("Cached {} episodes from Jikan for ID {}", count, anilist_id);
                return Ok(count);
            }
            Ok(_) => debug!("Jikan returned 0 episodes for ID {}", anilist_id),
            Err(e) => warn!(anilist_id, error = %e, "Failed to fetch from Jikan"),
        }

        Ok(0)
    }

    async fn fetch_from_anilist(&self, anilist_id: i32) -> Result<Vec<EpisodeInput>> {
        let anilist_eps = self.anilist.get_episodes(anilist_id).await?;
        if anilist_eps.is_empty() {
            return Ok(Vec::new());
        }

        let mut all_episodes = Vec::new();
        let mut seen_episodes = HashSet::new();

        for ep in anilist_eps {
            if let Some(title) = ep.title
                && let Some((number, real_title)) =
                    crate::parser::filename::parse_episode_title(&title)
                && number > 0
                && !seen_episodes.contains(&number)
            {
                seen_episodes.insert(number);
                all_episodes.push(EpisodeInput {
                    episode_number: number,
                    title: real_title,
                    title_japanese: None,
                    aired: ep.aired.clone(),
                    filler: false,
                    recap: false,
                });
            }
        }
        Ok(all_episodes)
    }

    async fn fetch_from_kitsu(&self, anilist_id: i32) -> Result<Vec<EpisodeInput>> {
        let Some(kitsu_id) = self.get_kitsu_id(anilist_id).await else {
            return Ok(Vec::new());
        };

        let kitsu_eps = self.kitsu.get_episodes(kitsu_id).await?;
        if kitsu_eps.is_empty() {
            return Ok(Vec::new());
        }

        let mut all_episodes = Vec::new();
        let mut seen_episodes = HashSet::new();

        for ep in kitsu_eps {
            if let Some(num) = ep.attributes.number
                && num > 0
                && !seen_episodes.contains(&num)
            {
                seen_episodes.insert(num);
                all_episodes.push(EpisodeInput {
                    episode_number: num,
                    title: ep.attributes.canonical_title,
                    title_japanese: None,
                    aired: ep.attributes.airdate,
                    filler: false,
                    recap: false,
                });
            }
        }
        Ok(all_episodes)
    }

    async fn fetch_from_jikan(&self, anilist_id: i32) -> Result<Vec<EpisodeInput>> {
        let Some(mal_id) = self.get_mal_id(anilist_id).await else {
            return Ok(Vec::new());
        };

        let mut all_episodes = Vec::new();
        let mut page = 1;

        loop {
            if page > 1 {
                tokio::time::sleep(Duration::from_millis(350)).await;
            }

            match self.jikan.get_episodes(mal_id, page).await {
                Ok(episodes) => {
                    if episodes.is_empty() {
                        break;
                    }

                    let count = episodes.len();
                    for ep in episodes {
                        all_episodes.push(EpisodeInput {
                            episode_number: ep.mal_id,
                            title: ep.title,
                            title_japanese: ep.title_japanese,
                            aired: ep.aired,
                            filler: ep.filler,
                            recap: ep.recap,
                        });
                    }

                    if count < 100 {
                        break;
                    }
                    page += 1;

                    if page > 10 {
                        warn!(anilist_id, "Reached episode fetch limit for anime");
                        break;
                    }
                }
                Err(e) => {
                    warn!(
                        page,
                        mal_id,
                        error = %e,
                        "Failed to fetch episodes page"
                    );
                    break;
                }
            }
        }
        Ok(all_episodes)
    }

    pub async fn refresh_episode_cache(&self, anilist_id: i32) -> Result<usize> {
        if let Ok(mut guard) = self.recent_fetches.write() {
            guard.remove(&anilist_id);
        }
        self.store.clear_episode_cache(anilist_id).await?;
        self.fetch_and_cache_episodes(anilist_id).await
    }

    pub async fn refresh_metadata_for_active_anime(&self) -> Result<()> {
        let start = std::time::Instant::now();
        info!(
            event = "metadata_refresh_started",
            "Refreshing metadata for airing anime..."
        );

        let monitored = self.store.list_monitored().await?;
        let releasing: Vec<_> = monitored
            .into_iter()
            .filter(|a| a.status == "RELEASING" || a.status == "NOT_YET_RELEASED")
            .collect();

        let count = releasing.len();
        info!(count, "Found anime to refresh metadata for");

        let mut errors = 0;
        for anime in releasing {
            if let Err(e) = self.fetch_and_cache_episodes(anime.id).await {
                warn!(
                    anime = %anime.title.romaji,
                    error = %e,
                    "Failed to refresh metadata"
                );
                errors += 1;
            }

            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        info!(
            event = "metadata_refresh_finished",
            processed = count,
            errors = errors,
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "Metadata refresh complete"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_episode_input() {
        let input = EpisodeInput {
            episode_number: 1,
            title: Some("The Beginning".to_string()),
            title_japanese: None,
            aired: None,
            filler: false,
            recap: false,
        };
        assert_eq!(input.episode_number, 1);
        assert_eq!(input.title.as_deref(), Some("The Beginning"));
    }
}
