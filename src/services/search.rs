use std::sync::Arc;

use anyhow::{Context, Result};
use tracing::info;

use crate::clients::nyaa::{NyaaCategory, NyaaClient, NyaaFilter, NyaaTorrent};
use crate::clients::seadex::SeaDexRelease;
use crate::config::Config;
use crate::db::Store;
use crate::parser::filename::detect_season_from_title;
use crate::quality::parse_quality_from_filename;
use crate::services::download::{DownloadAction, DownloadDecisionService};
use crate::services::seadex::SeaDexService;

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

/// Result item for manual search operations.
#[derive(Debug, Clone, serde::Serialize)]
#[allow(clippy::struct_excessive_bools)]
pub struct ManualSearchResult {
    pub title: String,
    pub magnet: String,
    pub torrent_url: String,
    pub view_url: String,
    pub size: String,
    pub seeders: u32,
    pub leechers: u32,
    pub downloads: u32,
    pub pub_date: String,
    pub info_hash: String,
    pub trusted: bool,
    pub remake: bool,
    pub parsed_title: String,
    pub parsed_episode: Option<f32>,
    pub parsed_group: Option<String>,
    pub parsed_resolution: Option<String>,
    pub is_seadex: bool,
    pub is_seadex_best: bool,
}

/// Results container for manual search operations.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ManualSearchResults {
    pub results: Vec<ManualSearchResult>,
    pub seadex_groups: Vec<String>,
}

pub struct SearchService {
    store: Store,
    nyaa: NyaaClient,
    download_decisions: DownloadDecisionService,
    config: Config,
    seadex_service: Arc<SeaDexService>,
}

impl SearchService {
    #[must_use]
    pub const fn new(
        store: Store,
        nyaa: NyaaClient,
        download_decisions: DownloadDecisionService,
        config: Config,
        seadex_service: Arc<SeaDexService>,
    ) -> Self {
        Self {
            store,
            nyaa,
            download_decisions,
            config,
            seadex_service,
        }
    }

    /// Searches for a specific episode across configured indexers.
    ///
    /// This method performs a targeted search for a single episode, applying
    /// quality profiles, release rules, and `SeaDex` preferences to filter results.
    /// Results are cached to avoid redundant searches.
    ///
    /// # Arguments
    ///
    /// * `anime_id` - The unique identifier of the anime to search for
    /// * `episode_number` - The specific episode number to find
    ///
    /// # Returns
    ///
    /// Returns `Ok(Vec<SearchResult>)` containing matching releases sorted by
    /// download action priority (downloads first) and seeders (descending).
    ///
    /// # Errors
    ///
    /// - Returns `Err` if the anime is not found in the database
    /// - Returns `Err` if the Nyaa API request fails
    /// - Returns `Err` if database queries for rules/profiles fail
    ///
    /// # Performance
    ///
    /// This method implements N+1 query prevention by fetching all decision
    /// context (profile, rules, status) before the result filtering loop.
    /// Results are cached using the search query string as the cache key.
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

    /// Searches for all available episodes of an anime across configured indexers.
    ///
    /// This method performs a comprehensive search for all releases matching the
    /// anime title, then deduplicates episodes to find the best candidate for each.
    /// It applies quality profiles, release rules, and `SeaDex` preferences.
    ///
    /// # Arguments
    ///
    /// * `anime_id` - The unique identifier of the anime to search for
    ///
    /// # Returns
    ///
    /// Returns `Ok(Vec<SearchResult>)` containing the best release for each
    /// episode, sorted by download action priority and seeders.
    ///
    /// # Errors
    ///
    /// - Returns `Err` if the anime is not found in the database
    /// - Returns `Err` if the Nyaa API request fails
    /// - Returns `Err` if database queries for context fail
    ///
    /// # Algorithm
    ///
    /// 1. Fetches search context (profile, rules, episode statuses, `SeaDex` groups)
    /// 2. Searches Nyaa for the anime title
    /// 3. Filters candidates by season and minimum seeders
    /// 4. Sorts by `SeaDex` status and seed count
    /// 5. Deduplicates to get best candidate per episode
    /// 6. Applies download decision logic to each candidate
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

    /// Performs a manual search for releases.
    ///
    /// This is used by the manual search UI to find releases on Nyaa
    /// with optional `SeaDex` integration.
    ///
    /// # Arguments
    ///
    /// * `query` - The search query string
    /// * `category_opt` - Optional category filter ("`anime_english`", "`anime_raw`", "`anime_non_english`", "`all_anime`")
    /// * `filter_opt` - Optional filter ("`no_filter`", "`no_remakes`", "`trusted_only`")
    /// * `anime_id` - Optional anime ID for `SeaDex` integration
    pub async fn search_releases(
        &self,
        query: &str,
        category_opt: Option<&str>,
        filter_opt: Option<&str>,
        anime_id: Option<i32>,
    ) -> Result<ManualSearchResults> {
        // Map category string to NyaaCategory
        let category = match category_opt {
            Some("anime_english") => NyaaCategory::AnimeEnglish,
            Some("anime_raw") => NyaaCategory::AnimeRaw,
            Some("anime_non_english") => NyaaCategory::AnimeNonEnglish,
            Some("all_anime") => NyaaCategory::AllAnime,
            _ => NyaaCategory::AllAnime,
        };

        // Map filter string to NyaaFilter
        let filter = match filter_opt {
            Some("no_filter") => NyaaFilter::NoFilter,
            Some("no_remakes") => NyaaFilter::NoRemakes,
            Some("trusted_only") => NyaaFilter::TrustedOnly,
            _ => NyaaFilter::NoFilter,
        };

        // Search on Nyaa
        let torrents = self
            .nyaa
            .search(query, category, filter)
            .await
            .context("Nyaa search failed")?;

        // Fetch SeaDex data if anime_id is provided
        let mut seadex_groups = Vec::new();
        let mut best_release_group = None;

        if let Some(id) = anime_id {
            let releases = self.seadex_service.get_releases(id).await;
            if !releases.is_empty() {
                seadex_groups = releases.iter().map(|r| r.release_group.clone()).collect();
                best_release_group = releases.first().map(|r| r.release_group.clone());
            }
        }

        // Map torrents to search results
        let results: Vec<ManualSearchResult> = torrents
            .into_iter()
            .map(|t| {
                let parsed = crate::parser::filename::parse_filename(&t.title);
                let parsed_group = parsed.as_ref().and_then(|p| p.group.clone());
                let is_seadex = parsed_group
                    .as_ref()
                    .is_some_and(|g| seadex_groups.contains(g));

                let is_seadex_best = parsed_group
                    .as_ref()
                    .is_some_and(|g| Some(g) == best_release_group.as_ref());

                ManualSearchResult {
                    magnet: t.magnet_link(),
                    title: t.title,
                    torrent_url: t.torrent_url,
                    view_url: t.view_url,
                    size: t.size,
                    seeders: t.seeders,
                    leechers: t.leechers,
                    downloads: t.downloads,
                    pub_date: t.pub_date,
                    info_hash: t.info_hash,
                    trusted: t.trusted,
                    remake: t.remake,
                    parsed_title: parsed.as_ref().map(|p| p.title.clone()).unwrap_or_default(),
                    parsed_episode: parsed.as_ref().map(|p| p.episode_number),
                    parsed_group,
                    parsed_resolution: parsed.as_ref().and_then(|p| p.resolution.clone()),
                    is_seadex,
                    is_seadex_best,
                }
            })
            .collect();

        Ok(ManualSearchResults {
            results,
            seadex_groups,
        })
    }

    /// Fetches `SeaDex` releases using the `seadex_service`.
    /// This delegates to `SeaDexService` which handles caching.
    async fn _get_seadex_releases(&self, anime_id: i32) -> Vec<SeaDexRelease> {
        self.seadex_service.get_releases(anime_id).await
    }
}
