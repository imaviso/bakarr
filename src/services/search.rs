use anyhow::Result;
use tracing::info;

use crate::clients::nyaa::{NyaaCategory, NyaaClient, NyaaFilter, NyaaTorrent};
use crate::config::Config;
use crate::db::Store;
use crate::parser::filename::detect_season_from_title;
use crate::quality::parse_quality_from_filename;
use crate::services::download::{DownloadAction, DownloadDecisionService};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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
    #[must_use]
    pub const fn new(
        store: Store,
        nyaa: NyaaClient,
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

    #[allow(clippy::too_many_lines)]
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

        let start = std::time::Instant::now();
        info!(
            event = "search_started",
            anime_id = anime_id,
            episode_number = episode_number,
            query = %query,
            "Searching for episode"
        );

        if let Ok(Some(cached)) = self.store.get_cached_search(&query).await {
            info!(
                event = "search_cache_hit",
                anime_id = anime_id,
                episode_number = episode_number,
                query = %query,
                results_count = cached.len(),
                "Returning cached search results"
            );
            return Ok(cached);
        }

        // Optimization: Fetch decision context once before the loop to avoid N+1 queries
        let profile = self
            .download_decisions
            .get_quality_profile_for_anime(anime_id)
            .await?;
        let rules = self.store.get_release_rules_for_anime(anime_id).await?;
        let current_status = self
            .store
            .get_episode_status(anime_id, episode_number)
            .await?;
        let seadex_groups = self.get_seadex_groups_cached(anime_id).await;

        let expected_season = detect_season_from_title(&anime.title.romaji);

        let filter = if self.config.nyaa.filter_remakes {
            NyaaFilter::NoRemakes
        } else {
            NyaaFilter::NoFilter
        };

        let torrents_result = self
            .nyaa
            .search(&anime.title.romaji, NyaaCategory::AnimeEnglish, filter)
            .await;

        let torrents = match torrents_result {
            Ok(t) => t,
            Err(e) => {
                use tracing::error;
                error!(
                   event = "search_failed",
                   anime_id = anime_id,
                   episode_number = episode_number,
                   error = %e,
                   "Search failed"
                );
                return Err(e);
            }
        };

        let mut results = Vec::new();

        for torrent in torrents {
            let Some(parsed) = crate::parser::filename::parse_filename(&torrent.title) else {
                continue;
            };

            if let Some(season) = parsed.season
                && let Some(expected) = expected_season
                && season != expected
            {
                continue;
            }

            #[allow(clippy::cast_precision_loss)]
            if (parsed.episode_number - episode_number as f32).abs() > 0.1 {
                continue;
            }

            let is_seadex = Self::is_from_seadex_group(&torrent.title, &seadex_groups);
            let release_quality = parse_quality_from_filename(&torrent.title);

            // Use the pure function version to avoid DB lookups in loop
            let action = DownloadDecisionService::decide_download(
                &profile,
                &rules,
                current_status.as_ref(),
                &torrent.title,
                is_seadex,
                Some(crate::parser::size::parse_size(&torrent.size).unwrap_or(0)),
            );

            results.push(SearchResult {
                title: torrent.title.clone(),
                indexer: "Nyaa".to_string(),
                link: torrent.magnet_link(),
                info_hash: torrent.info_hash.to_lowercase(),
                size: crate::parser::size::parse_size(&torrent.size)
                    .unwrap_or(0)
                    .cast_unsigned(),
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

        info!(
            event = "search_finished",
            anime_id = anime_id,
            episode_number = episode_number,
            results_count = results.len(),
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "Search finished"
        );

        if let Err(e) = self.store.cache_search_results(&query, &results).await {
            tracing::warn!(error = %e, "Failed to cache search results");
        }

        Ok(results)
    }

    pub async fn search_anime(&self, anime_id: i32) -> Result<Vec<SearchResult>> {
        let anime = self
            .store
            .get_anime(anime_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Anime not found"))?;

        let start = std::time::Instant::now();
        info!(
            event = "search_started",
            anime_id = anime_id,
            query = %anime.title.romaji,
            "Searching for all episodes"
        );

        let query_str = anime.title.romaji.clone();
        if let Ok(Some(cached)) = self.store.get_cached_search(&query_str).await {
            info!(
                event = "search_cache_hit",
                anime_id = anime_id,
                query = %query_str,
                results_count = cached.len(),
                "Returning cached search results"
            );
            return Ok(cached);
        }

        // We wrap the logic in a block or closure if we want to catch errors easily,
        // but since this function has multiple '?' operators, it's easier to just match on the result if we want to log failure.
        // Or simply log success at the end and rely on the caller/middleware to log the error.
        // However, for consistency with 'search_episode', let's try to capture errors specifically for the 'search_failed' event if possible.
        // But here the logic is a bit more complex. Let's stick to the happy path instrumentation for now,
        // as errors will bubble up. Actually, if I want 'search_failed', I should use a helper or modify the flow slightly.
        // I will instrument the start and success paths. Errors from Nyaa will be logged by the caller usually,
        // but adding specific context here is better.

        let context_res = self.get_search_context(anime_id).await;
        let (profile, rules, status_map, seadex_groups) = match context_res {
            Ok(ctx) => ctx,
            Err(e) => {
                use tracing::error;
                error!(event = "search_failed", anime_id = anime_id, error = %e, "Failed to get search context");
                return Err(e);
            }
        };

        let torrents_res = self.fetch_torrents_for_search(&anime.title.romaji).await;
        let torrents = match torrents_res {
            Ok(t) => t,
            Err(e) => {
                use tracing::error;
                error!(event = "search_failed", anime_id = anime_id, error = %e, "Failed to fetch torrents");
                return Err(e);
            }
        };

        let expected_season = detect_season_from_title(&anime.title.romaji);
        let candidates =
            self.filter_and_sort_candidates(&torrents, &seadex_groups, expected_season);
        let best_candidates = self.deduplicate_episodes(candidates).await;

        let mut results = Vec::new();

        for (torrent, parsed) in best_candidates {
            #[allow(clippy::cast_possible_truncation)]
            let episode_number = parsed.episode_number as i32;
            let is_seadex = Self::is_from_seadex_group(&torrent.title, &seadex_groups);
            let release_quality = parse_quality_from_filename(&torrent.title);

            let status = status_map.get(&episode_number);

            let action = DownloadDecisionService::decide_download(
                &profile,
                &rules,
                status,
                &torrent.title,
                is_seadex,
                Some(crate::parser::size::parse_size(&torrent.size).unwrap_or(0)),
            );

            results.push(SearchResult {
                title: torrent.title.clone(),
                indexer: "Nyaa".to_string(),
                link: torrent.magnet_link(),
                info_hash: torrent.info_hash.to_lowercase(),
                size: crate::parser::size::parse_size(&torrent.size)
                    .unwrap_or(0)
                    .cast_unsigned(),
                seeders: torrent.seeders,
                leechers: torrent.leechers,
                publish_date: torrent.pub_date.clone(),
                download_action: action,
                quality: release_quality.to_string(),
                group: parsed.group,
                episode_number: parsed.episode_number,
            });
        }

        info!(
            event = "search_finished",
            anime_id = anime_id,
            results_count = results.len(),
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "Search finished"
        );

        if let Err(e) = self.store.cache_search_results(&query_str, &results).await {
            tracing::warn!(error = %e, "Failed to cache search results");
        }

        Ok(results)
    }

    async fn get_search_context(
        &self,
        anime_id: i32,
    ) -> Result<(
        crate::quality::QualityProfile,
        Vec<crate::entities::release_profile_rules::Model>,
        std::collections::HashMap<i32, crate::db::EpisodeStatusRow>,
        Vec<String>,
    )> {
        let profile = self
            .download_decisions
            .get_quality_profile_for_anime(anime_id)
            .await?;

        let rules = self.store.get_release_rules_for_anime(anime_id).await?;

        let episode_statuses = self.store.get_episode_statuses(anime_id).await?;
        let status_map: std::collections::HashMap<i32, crate::db::EpisodeStatusRow> =
            episode_statuses
                .into_iter()
                .map(|s| (s.episode_number, s))
                .collect();

        let seadex_groups = self.get_seadex_groups_cached(anime_id).await;
        Ok((profile, rules, status_map, seadex_groups))
    }

    async fn fetch_torrents_for_search(&self, title: &str) -> Result<Vec<NyaaTorrent>> {
        let filter = if self.config.nyaa.filter_remakes {
            NyaaFilter::NoRemakes
        } else {
            NyaaFilter::NoFilter
        };

        self.nyaa
            .search(title, NyaaCategory::AnimeEnglish, filter)
            .await
    }

    fn filter_and_sort_candidates<'a>(
        &self,
        torrents: &'a [NyaaTorrent],
        seadex_groups: &[String],
        expected_season: Option<i32>,
    ) -> Vec<(&'a NyaaTorrent, crate::models::release::Release)> {
        let mut candidates: Vec<_> = torrents
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
            .filter(|(_, r)| {
                if let Some(season) = r.season
                    && let Some(expected) = expected_season
                    && season != expected
                {
                    return false;
                }
                true
            })
            .collect();

        candidates.sort_by(|(a_torrent, _), (b_torrent, _)| {
            let a_seadex = Self::is_from_seadex_group(&a_torrent.title, seadex_groups);
            let b_seadex = Self::is_from_seadex_group(&b_torrent.title, seadex_groups);

            match (a_seadex, b_seadex) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => b_torrent.seeders.cmp(&a_torrent.seeders),
            }
        });
        candidates
    }

    async fn deduplicate_episodes<'a>(
        &self,
        candidates: Vec<(&'a NyaaTorrent, crate::models::release::Release)>,
    ) -> Vec<(&'a NyaaTorrent, crate::models::release::Release)> {
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
            #[allow(clippy::cast_possible_truncation)]
            let ep_key = (ep * 10.0).round() as i32;

            if !seen_episodes.insert(ep_key) {
                continue;
            }
            best_candidates.push(candidate);
        }
        best_candidates
    }

    pub async fn get_seadex_groups_cached(&self, anime_id: i32) -> Vec<String> {
        if matches!(self.store.is_seadex_cache_fresh(anime_id).await, Ok(true))
            && let Ok(Some(cache)) = self.store.get_seadex_cache(anime_id).await
        {
            return cache.get_groups();
        }

        self.config.downloads.preferred_groups.clone()
    }

    fn is_from_seadex_group(title: &str, seadex_groups: &[String]) -> bool {
        let title_lower = title.to_lowercase();
        seadex_groups
            .iter()
            .any(|g| title_lower.contains(&g.to_lowercase()))
    }
}
