use crate::clients::anilist::AnilistClient;
use crate::clients::jikan::JikanClient;
use crate::clients::kitsu::KitsuClient;
use crate::clients::offline_db::OfflineDatabase;
use crate::db::Store;
use crate::entities::episode_metadata::Model as EpisodeMetadata;
use crate::models::episode::EpisodeInput;
use anyhow::Result;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

#[derive(Clone)]
pub struct EpisodeService {
    jikan: JikanClient,
    anilist: AnilistClient,
    kitsu: KitsuClient,
    offline_db: Arc<RwLock<Option<OfflineDatabase>>>,
    store: Store,

    recent_fetches: Arc<std::sync::RwLock<HashMap<i32, Instant>>>,
}

impl EpisodeService {
    #[must_use]
    pub fn new(store: Store) -> Self {
        Self {
            jikan: JikanClient::new(),
            anilist: AnilistClient::new(),
            kitsu: KitsuClient::new(),
            offline_db: Arc::new(RwLock::new(None)),
            store,
            recent_fetches: Arc::new(std::sync::RwLock::new(HashMap::new())),
        }
    }

    async fn ensure_offline_db(&self) -> Result<()> {
        let mut db = self.offline_db.write().await;
        if db.is_none() {
            *db = Some(OfflineDatabase::load().await?);
        }
        drop(db);
        Ok(())
    }

    async fn get_mal_id(&self, anilist_id: i32) -> Option<i32> {
        if let Err(e) = self.ensure_offline_db().await {
            warn!("Failed to load offline database: {}", e);
            return None;
        }

        let db = self.offline_db.read().await;
        db.as_ref().and_then(|d| d.anilist_to_mal(anilist_id))
    }

    async fn get_kitsu_id(&self, anilist_id: i32) -> Option<i32> {
        if let Err(e) = self.ensure_offline_db().await {
            warn!("Failed to load offline database: {}", e);
            return None;
        }

        let db = self.offline_db.read().await;
        db.as_ref().and_then(|d| d.anilist_to_kitsu(anilist_id))
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
            debug!("Failed to fetch episodes from Jikan: {}", e);
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
            debug!("Failed to fetch episodes from Jikan: {}", e);
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
            Err(e) => warn!("Failed to fetch from AniList for ID {}: {}", anilist_id, e),
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
            Err(e) => warn!("Failed to fetch from Kitsu for ID {}: {}", anilist_id, e),
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
            Err(e) => warn!("Failed to fetch from Jikan for ID {}: {}", anilist_id, e),
        }

        Ok(0)
    }

    async fn fetch_from_anilist(&self, anilist_id: i32) -> Result<Vec<EpisodeInput>> {
        let anilist_eps = self.anilist.get_episodes(anilist_id).await?;
        if anilist_eps.is_empty() {
            return Ok(Vec::new());
        }

        let mut all_episodes = Vec::new();
        let re = Regex::new(r"(?i)^Episode\s+(\d+)(?:\s*-\s*(.+))?$").unwrap();
        let mut seen_episodes = HashSet::new();

        for ep in anilist_eps {
            if let Some(title) = ep.title
                && let Some(caps) = re.captures(&title)
            {
                let number = caps[1].parse::<i32>().unwrap_or(0);
                let real_title = caps.get(2).map(|t| t.as_str().to_string());

                if number > 0 && !seen_episodes.contains(&number) {
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
                        warn!("Reached episode fetch limit for anime {}", anilist_id);
                        break;
                    }
                }
                Err(e) => {
                    warn!(
                        "Failed to fetch episodes page {} for MAL {}: {}",
                        page, mal_id, e
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
        info!("Refreshing metadata for airing anime...");

        let monitored = self.store.list_monitored().await?;
        let releasing: Vec<_> = monitored
            .into_iter()
            .filter(|a| a.status == "RELEASING" || a.status == "NOT_YET_RELEASED")
            .collect();

        info!("Found {} anime to refresh metadata for", releasing.len());

        for anime in releasing {
            if let Err(e) = self.fetch_and_cache_episodes(anime.id).await {
                warn!(
                    "Failed to refresh metadata for {}: {}",
                    anime.title.romaji, e
                );
            }

            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        info!("Metadata refresh complete");
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
