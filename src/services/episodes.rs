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

        Ok(format!("Episode {}", episode_number))
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

        info!("Fetching episodes from AniList for ID {}", anilist_id);
        match self.anilist.get_episodes(anilist_id).await {
            Ok(anilist_eps) if !anilist_eps.is_empty() => {
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

                if !all_episodes.is_empty() {
                    let count = all_episodes.len();
                    self.store.cache_episodes(anilist_id, &all_episodes).await?;
                    info!(
                        "Cached {} episodes from AniList for anime {}",
                        count, anilist_id
                    );
                    return Ok(count);
                }
            }
            Ok(_) => debug!("AniList returned 0 episodes"),
            Err(e) => warn!("Failed to fetch from AniList: {}", e),
        }

        if let Some(kitsu_id) = self.get_kitsu_id(anilist_id).await {
            info!("Fetching episodes from Kitsu for ID {}", kitsu_id);
            match self.kitsu.get_episodes(kitsu_id).await {
                Ok(kitsu_eps) if !kitsu_eps.is_empty() => {
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

                    if !all_episodes.is_empty() {
                        let count = all_episodes.len();
                        self.store.cache_episodes(anilist_id, &all_episodes).await?;
                        info!(
                            "Cached {} episodes from Kitsu for anime {}",
                            count, anilist_id
                        );
                        return Ok(count);
                    }
                }
                Ok(_) => debug!("Kitsu returned 0 episodes"),
                Err(e) => warn!("Failed to fetch from Kitsu: {}", e),
            }
        } else {
            debug!("No Kitsu ID found for AniList ID {}", anilist_id);
        }

        debug!("Falling back to Jikan for episodes...");

        let Some(mal_id) = self.get_mal_id(anilist_id).await else {
            debug!("No MAL ID found for AniList ID {}", anilist_id);
            return Ok(0);
        };

        info!("Fetching episodes from Jikan for MAL ID {}", mal_id);

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

        let count = all_episodes.len();
        if count > 0 {
            self.store.cache_episodes(anilist_id, &all_episodes).await?;
            info!("Cached {} episodes for anime {}", count, anilist_id);
        } else {
            debug!("No episodes found for anime {} from any source", anilist_id);
        }

        Ok(count)
    }

    pub async fn refresh_episode_cache(&self, anilist_id: i32) -> Result<usize> {
        if let Ok(mut guard) = self.recent_fetches.write() {
            guard.remove(&anilist_id);
        }
        self.store.clear_episode_cache(anilist_id).await?;
        self.fetch_and_cache_episodes(anilist_id).await
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
