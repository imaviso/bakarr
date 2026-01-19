use anyhow::Result;
use tracing::{debug, info};

use crate::clients::nyaa::{NyaaCategory, NyaaClient, NyaaFilter, NyaaTorrent};
use crate::clients::seadex::SeaDexClient;
use crate::config::Config;
use crate::db::Store;
use crate::quality::parse_quality_from_filename;
use crate::services::download::{DownloadAction, DownloadDecisionService};

#[derive(Debug, Clone, serde::Serialize)]
pub struct SearchResult {
    pub title: String,
    pub indexer: String,
    pub link: String,
    pub info_hash: String,
    pub size: u64,
    pub seeders: u32,
    pub leechers: u32,
    pub publish_date: String,
    pub download_action: DownloadAction,
    pub quality: String,
    pub group: Option<String>,
    pub episode_number: f32,
}

pub struct SearchService {
    store: Store,
    nyaa: NyaaClient,
    download_decisions: DownloadDecisionService,
    config: Config,
}

impl SearchService {
    pub fn new(
        store: Store,
        nyaa: NyaaClient,
        _seadex: SeaDexClient,
        download_decisions: DownloadDecisionService,
        config: Config,
    ) -> Self {
        Self {
            store,
            nyaa,
            download_decisions,
            config,
        }
    }

    pub async fn search_episode(
        &self,
        anime_id: i32,
        episode_number: i32,
    ) -> Result<Vec<SearchResult>> {
        let anime = self
            .store
            .get_anime(anime_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Anime not found"))?;

        let query = format!("{} {:02}", anime.title.romaji, episode_number);

        info!("Searching for '{}'", query);

        let seadex_groups = self.get_seadex_groups_cached(anime_id).await;

        let filter = if self.config.nyaa.filter_remakes {
            NyaaFilter::NoRemakes
        } else {
            NyaaFilter::NoFilter
        };

        let torrents = self
            .nyaa
            .search(&anime.title.romaji, NyaaCategory::AnimeEnglish, filter)
            .await?;

        let mut results = Vec::new();

        for torrent in torrents {
            let parsed = match crate::parser::filename::parse_filename(&torrent.title) {
                Some(p) => p,
                None => continue,
            };

            if (parsed.episode_number - episode_number as f32).abs() > 0.1 {
                continue;
            }

            let is_seadex = self.is_from_seadex_group(&torrent.title, &seadex_groups);
            let release_quality = parse_quality_from_filename(&torrent.title);

            let action = self
                .download_decisions
                .should_download(anime_id, episode_number, &torrent.title, is_seadex)
                .await
                .unwrap_or(DownloadAction::Reject {
                    reason: "Failed to determine decision".to_string(),
                });

            results.push(SearchResult {
                title: torrent.title.clone(),
                indexer: "Nyaa".to_string(),
                link: torrent.magnet_link(),
                info_hash: torrent.info_hash.clone(),
                size: 0,
                seeders: torrent.seeders,
                leechers: torrent.leechers,
                publish_date: torrent.pub_date.clone(),
                download_action: action,
                quality: release_quality.to_string(),
                group: parsed.group,
                episode_number: parsed.episode_number,
            });
        }

        results.sort_by(|a, b| {
            let a_ok = a.download_action.should_download();
            let b_ok = b.download_action.should_download();

            if a_ok && !b_ok {
                return std::cmp::Ordering::Less;
            }
            if !a_ok && b_ok {
                return std::cmp::Ordering::Greater;
            }

            b.seeders.cmp(&a.seeders)
        });

        Ok(results)
    }

    pub async fn search_anime(&self, anime_id: i32) -> Result<Vec<SearchResult>> {
        let anime = self
            .store
            .get_anime(anime_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Anime not found"))?;

        debug!("Searching for all episodes of '{}'", anime.title.romaji);

        let profile = self
            .download_decisions
            .get_quality_profile_for_anime(anime_id)
            .await?;

        let episode_statuses = self.store.get_episode_statuses(anime_id).await?;
        let status_map: std::collections::HashMap<i32, crate::db::EpisodeStatusRow> =
            episode_statuses
                .into_iter()
                .map(|s| (s.episode_number, s))
                .collect();

        let seadex_groups = self.get_seadex_groups_cached(anime_id).await;

        let filter = if self.config.nyaa.filter_remakes {
            NyaaFilter::NoRemakes
        } else {
            NyaaFilter::NoFilter
        };

        let torrents = self
            .nyaa
            .search(&anime.title.romaji, NyaaCategory::AnimeEnglish, filter)
            .await?;

        let mut candidates: Vec<(&NyaaTorrent, crate::models::release::Release)> = torrents
            .iter()
            .filter(|t| {
                if t.seeders < self.config.nyaa.min_seeders {
                    return false;
                }

                if let Some(ref res) = self.config.nyaa.preferred_resolution
                    && !t.title.to_lowercase().contains(&res.to_lowercase())
                {
                    return false;
                }
                true
            })
            .filter_map(|t| crate::parser::filename::parse_filename(&t.title).map(|r| (t, r)))
            .collect();

        candidates.sort_by(|(a_torrent, _), (b_torrent, _)| {
            let a_seadex = self.is_from_seadex_group(&a_torrent.title, &seadex_groups);
            let b_seadex = self.is_from_seadex_group(&b_torrent.title, &seadex_groups);

            match (a_seadex, b_seadex) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => b_torrent.seeders.cmp(&a_torrent.seeders),
            }
        });

        let mut best_candidates = Vec::new();
        let mut seen_episodes = std::collections::HashSet::new();

        for candidate in candidates {
            if self
                .store
                .is_blocked(&candidate.0.info_hash)
                .await
                .unwrap_or(false)
            {
                continue;
            }

            let ep = candidate.1.episode_number;
            let ep_key = (ep * 10.0).round() as i32;

            if !seen_episodes.contains(&ep_key) {
                seen_episodes.insert(ep_key);
                best_candidates.push(candidate);
            }
        }

        let mut results = Vec::new();

        for (torrent, parsed) in best_candidates {
            let episode_number = parsed.episode_number as i32;
            let is_seadex = self.is_from_seadex_group(&torrent.title, &seadex_groups);
            let release_quality = parse_quality_from_filename(&torrent.title);

            let status = status_map.get(&episode_number);

            let action = self.download_decisions.decide_download(
                &profile,
                status,
                &torrent.title,
                is_seadex,
            );

            results.push(SearchResult {
                title: torrent.title.clone(),
                indexer: "Nyaa".to_string(),
                link: torrent.magnet_link(),
                info_hash: torrent.info_hash.clone(),
                size: 0,
                seeders: torrent.seeders,
                leechers: torrent.leechers,
                publish_date: torrent.pub_date.clone(),
                download_action: action,
                quality: release_quality.to_string(),
                group: parsed.group,
                episode_number: parsed.episode_number,
            });
        }

        Ok(results)
    }

    pub async fn get_seadex_groups_cached(&self, anime_id: i32) -> Vec<String> {
        if let Ok(true) = self.store.is_seadex_cache_fresh(anime_id).await
            && let Ok(Some(cache)) = self.store.get_seadex_cache(anime_id).await
        {
            return cache.get_groups();
        }

        self.config.downloads.preferred_groups.clone()
    }

    fn is_from_seadex_group(&self, title: &str, seadex_groups: &[String]) -> bool {
        let title_lower = title.to_lowercase();
        seadex_groups
            .iter()
            .any(|g| title_lower.contains(&g.to_lowercase()))
    }
}
