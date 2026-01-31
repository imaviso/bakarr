use crate::api::{SearchResultDto, TitleDto};
use crate::parser::filename::parse_filename;
use crate::quality::determine_quality_id;
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

#[derive(Debug, Default)]
pub struct LibraryScanStats {
    pub scanned: i32,
    pub matched: i32,
    pub updated: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct UnmappedFolder {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub suggested_matches: Vec<SearchResultDto>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ScannerState {
    pub is_scanning: bool,
    pub folders: Vec<UnmappedFolder>,
    pub last_updated: Option<DateTime<Utc>>,
}

pub struct LibraryScannerService {
    state: Arc<RwLock<ScannerState>>,
    store: crate::db::Store,
    config: Arc<RwLock<crate::config::Config>>,
    event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
}

impl LibraryScannerService {
    pub fn new(
        store: crate::db::Store,
        config: Arc<RwLock<crate::config::Config>>,
        event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
    ) -> Self {
        Self {
            state: Arc::new(RwLock::new(ScannerState::default())),
            store,
            config,
            event_bus,
        }
    }

    pub async fn get_state(&self) -> ScannerState {
        self.state.read().await.clone()
    }

    /// Triggers a library file scan in the background.
    pub fn trigger_library_scan(&self) {
        let self_clone = Arc::new(Self {
            state: self.state.clone(),
            store: self.store.clone(),
            config: self.config.clone(),
            event_bus: self.event_bus.clone(),
        });

        tokio::spawn(async move {
            if let Err(e) = self_clone.scan_library_files().await {
                tracing::error!("Library scan failed: {}", e);
            }
        });
    }

    pub async fn start_scan(&self) {
        let state = self.state.clone();
        let store = self.store.clone();
        let config = self.config.clone();
        let event_bus = self.event_bus.clone();

        {
            let mut guard = state.write().await;
            if guard.is_scanning {
                return;
            }
            guard.is_scanning = true;

            guard.folders.clear();
        }

        tokio::spawn(async move {
            let start = std::time::Instant::now();
            let _ = event_bus.send(crate::domain::events::NotificationEvent::ScanStarted);
            info!(
                event = "discovery_scan_started",
                "Starting unmapped folder discovery"
            );

            if let Err(e) =
                Self::perform_scan(state.clone(), store, config, event_bus.clone()).await
            {
                error!(event = "discovery_scan_failed", error = %e, "Scan failed");
                let _ = event_bus.send(crate::domain::events::NotificationEvent::Error {
                    message: format!("Scan failed: {e}"),
                });
            }

            let mut guard = state.write().await;
            guard.is_scanning = false;
            guard.last_updated = Some(Utc::now());
            let folder_count = guard.folders.len();
            drop(guard);

            let _ = event_bus.send(crate::domain::events::NotificationEvent::ScanFinished);
            info!(
                event = "discovery_scan_finished",
                folders_found = folder_count,
                duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
                "Unmapped folder discovery finished"
            );
        });
    }

    #[allow(clippy::too_many_lines)]
    pub async fn scan_library_files(&self) -> anyhow::Result<LibraryScanStats> {
        let start = std::time::Instant::now();
        let library_path = {
            let cfg = self.config.read().await;
            PathBuf::from(&cfg.library.library_path)
        };

        if !library_path.exists() {
            return Err(anyhow::anyhow!(
                "Library path does not exist: {}",
                library_path.display()
            ));
        }

        let _ = self
            .event_bus
            .send(crate::domain::events::NotificationEvent::LibraryScanStarted);
        info!(path = %library_path.display(), "Scanning library");

        let title_map = self.build_monitored_title_map().await?;
        let video_extensions = crate::constants::VIDEO_EXTENSIONS;
        let mut stats = LibraryScanStats::default();

        // Cache: AnimeID -> Set of EpisodeNumbers that exist in DB
        let mut anime_episode_cache: std::collections::HashMap<
            i32,
            std::collections::HashSet<i32>,
        > = std::collections::HashMap::new();

        let (tx, mut rx) = tokio::sync::mpsc::channel(100);
        let scan_path = library_path.clone();

        // Offload blocking I/O to a dedicated thread
        tokio::task::spawn_blocking(move || {
            let walker = walkdir::WalkDir::new(&scan_path)
                .follow_links(true)
                .into_iter()
                .filter_map(std::result::Result::ok);

            for entry in walker {
                if entry.path().is_file()
                    && let Some(path_str) = entry.path().to_str()
                {
                    let _ = tx.blocking_send(path_str.to_string());
                }
            }
        });

        while let Some(path_str) = rx.recv().await {
            let path = PathBuf::from(&path_str);
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(str::to_lowercase)
                .unwrap_or_default();

            if !video_extensions.contains(&extension.as_str()) {
                continue;
            }

            stats.scanned += 1;
            if stats.scanned % 100 == 0 {
                let _ = self.event_bus.send(
                    crate::domain::events::NotificationEvent::LibraryScanProgress {
                        scanned: stats.scanned,
                    },
                );
            }

            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let Some(release) = parse_filename(filename) else {
                continue;
            };

            let (anime_opt, _) =
                self.match_file_to_anime(&path, &release, &title_map, Some(&library_path));
            let Some(anime) = anime_opt else {
                continue;
            };

            #[allow(clippy::cast_possible_truncation)]
            let episode_number = release.episode_number as i32;

            // N+1 Optimization: Check cache first
            if let std::collections::hash_map::Entry::Vacant(e) =
                anime_episode_cache.entry(anime.id)
            {
                match self.store.get_episode_statuses(anime.id).await {
                    Ok(statuses) => {
                        let set: std::collections::HashSet<i32> =
                            statuses.into_iter().map(|s| s.episode_number).collect();
                        e.insert(set);
                    }
                    Err(e) => {
                        warn!(
                            "Failed to fetch episode statuses for anime {}: {}",
                            anime.id, e
                        );
                        continue;
                    }
                }
            }

            if let Some(set) = anime_episode_cache.get(&anime.id)
                && set.contains(&episode_number)
            {
                stats.matched += 1;
                continue;
            }

            // New file found - process and update DB
            match self.process_new_library_file(&path, &anime, &release).await {
                Ok(()) => {
                    stats.matched += 1;
                    stats.updated += 1;
                    if let Some(set) = anime_episode_cache.get_mut(&anime.id) {
                        set.insert(episode_number);
                    }
                }
                Err(e) => {
                    warn!(path = %path.display(), error = %e, "Failed to process library file");
                }
            }
        }

        let _ = self.event_bus.send(
            crate::domain::events::NotificationEvent::LibraryScanFinished {
                scanned: stats.scanned,
                matched: stats.matched,
                updated: stats.updated,
            },
        );

        info!(
            event = "library_scan_finished",
            scanned = stats.scanned,
            matched = stats.matched,
            updated = stats.updated,
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "Library scan completed"
        );

        Ok(stats)
    }

    async fn build_monitored_title_map(
        &self,
    ) -> anyhow::Result<std::collections::HashMap<String, crate::models::anime::Anime>> {
        let monitored = self.store.list_monitored().await?;
        let mut title_map = std::collections::HashMap::new();
        for anime in monitored {
            title_map.insert(anime.title.romaji.to_lowercase(), anime.clone());
            if let Some(ref en) = anime.title.english {
                title_map.insert(en.to_lowercase(), anime.clone());
            }
        }
        Ok(title_map)
    }

    async fn process_new_library_file(
        &self,
        path: &Path,
        anime: &crate::models::anime::Anime,
        release: &crate::models::release::Release,
    ) -> anyhow::Result<()> {
        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let file_size = tokio::fs::metadata(path)
            .await
            .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
            .ok();

        #[allow(clippy::cast_possible_truncation)]
        let episode_number = release.episode_number as i32;
        let season = release.season.unwrap_or(1);
        let quality_id = determine_quality_id(release);

        let media_service = crate::services::MediaService::new();
        let media_info = media_service.get_media_info(path).await.ok();

        self.store
            .mark_episode_downloaded(
                anime.id,
                episode_number,
                season,
                quality_id,
                false,
                path.to_str().unwrap_or(""),
                file_size,
                media_info.as_ref(),
            )
            .await?;

        info!(
            event = "library_file_matched",
            anime_title = %anime.title.romaji,
            episode = episode_number,
            filename = %filename,
            "Found episode in library"
        );

        Ok(())
    }

    #[must_use]
    pub fn match_file_to_anime(
        &self,
        file_path: &Path,
        release: &crate::models::release::Release,
        title_map: &std::collections::HashMap<String, crate::models::anime::Anime>,
        import_root: Option<&Path>,
    ) -> (Option<crate::models::anime::Anime>, Option<String>) {
        use crate::parser::filename::{clean_title, detect_season_from_title};

        let matched = title_map.get(&release.title.to_lowercase()).cloned();

        if matched.is_some() {
            return (matched, None);
        }

        let release_title_lower = release.title.to_lowercase();
        let file_season = release.season.unwrap_or(1);

        let mut candidates: Vec<(i32, &crate::models::anime::Anime)> = Vec::new();

        for (title, anime) in title_map {
            let is_match =
                release_title_lower.contains(title) || title.contains(&release_title_lower);
            if !is_match {
                continue;
            }

            let mut score: i32 = 0;

            #[allow(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
            let len_diff = (title.len() as i32 - release_title_lower.len() as i32).abs();
            score += 100 - len_diff.min(100);

            if title == &release_title_lower {
                score += 500;
            }

            let anime_season = detect_season_from_title(&anime.title.romaji).or_else(|| {
                anime
                    .title
                    .english
                    .as_ref()
                    .and_then(|t| detect_season_from_title(t))
            });

            if let Some(anime_s) = anime_season {
                if anime_s == file_season {
                    score += 200;
                } else {
                    score -= 200;
                }
            } else if file_season == 1 {
                score += 100;
            } else {
                score -= 50;
            }

            candidates.push((score, anime));
        }

        if let Some((_, best_anime)) = candidates.into_iter().max_by_key(|(score, _)| *score) {
            return (Some(best_anime.clone()), None);
        }

        let mut current_dir = file_path.parent();
        let mut best_guess = None;

        while let Some(dir) = current_dir {
            if let Some(root) = import_root
                && dir == root
            {
                break;
            }

            if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
                let lower = name.to_lowercase();

                let is_generic = crate::parser::filename::is_generic_media_folder(&lower);

                if !is_generic {
                    let clean = clean_title(name);

                    let clean =
                        if clean.starts_with('[') || clean.contains("] ") || clean.contains(" [") {
                            let mut result = String::new();
                            let mut inside_bracket = false;
                            for c in clean.chars() {
                                if c == '[' {
                                    inside_bracket = true;
                                    continue;
                                }
                                if c == ']' {
                                    inside_bracket = false;
                                    continue;
                                }
                                if !inside_bracket {
                                    result.push(c);
                                }
                            }
                            let s = clean_title(&result);
                            if s.is_empty() { clean } else { s }
                        } else {
                            clean
                        };

                    if let Some(a) = title_map.get(&clean.to_lowercase()) {
                        return (Some(a.clone()), Some(clean));
                    }

                    if best_guess.is_none() {
                        best_guess = Some(clean);
                    }
                }
            }
            current_dir = dir.parent();
        }

        (None, best_guess)
    }

    async fn perform_scan(
        state: Arc<RwLock<ScannerState>>,
        store: crate::db::Store,
        config: Arc<RwLock<crate::config::Config>>,
        event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
    ) -> anyhow::Result<()> {
        let library_path = {
            let cfg = config.read().await;
            PathBuf::from(&cfg.library.library_path)
        };

        if !library_path.exists() {
            return Err(anyhow::anyhow!("Library path does not exist"));
        }

        let existing_anime = store.list_all_anime().await?;
        let (existing_ids, known_paths, known_titles) =
            build_existing_anime_sets(&existing_anime).await;

        let initial_folders =
            collect_unmapped_folders(&library_path, &known_paths, &known_titles).await?;

        {
            let mut guard = state.write().await;
            guard.folders.clone_from(&initial_folders);
        }

        search_and_update_matches(state, &initial_folders, &existing_ids, &event_bus).await;

        Ok(())
    }
}

async fn build_existing_anime_sets(
    existing_anime: &[crate::models::anime::Anime],
) -> (
    std::collections::HashSet<i32>,
    std::collections::HashSet<PathBuf>,
    std::collections::HashSet<String>,
) {
    let existing_ids: std::collections::HashSet<i32> =
        existing_anime.iter().map(|a| a.id).collect();

    let mut known_paths = std::collections::HashSet::new();
    let mut known_titles = std::collections::HashSet::new();

    for anime in existing_anime {
        let clean_romaji = crate::parser::filename::clean_title(&anime.title.romaji).to_lowercase();
        if !clean_romaji.is_empty() {
            known_titles.insert(clean_romaji);
        }
        if let Some(eng) = &anime.title.english {
            let clean_eng = crate::parser::filename::clean_title(eng).to_lowercase();
            if !clean_eng.is_empty() {
                known_titles.insert(clean_eng);
            }
        }

        if let Some(path) = &anime.path {
            if let Ok(canon) = tokio::fs::canonicalize(Path::new(path)).await {
                known_paths.insert(canon);
            } else {
                known_paths.insert(Path::new(path).to_path_buf());
            }
        }
    }

    (existing_ids, known_paths, known_titles)
}

async fn collect_unmapped_folders(
    library_path: &Path,
    known_paths: &std::collections::HashSet<PathBuf>,
    known_titles: &std::collections::HashSet<String>,
) -> anyhow::Result<Vec<UnmappedFolder>> {
    let mut folders = Vec::new();
    let mut dir_entries = tokio::fs::read_dir(library_path).await?;

    while let Ok(Some(entry)) = dir_entries.next_entry().await {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let canon_path = (tokio::fs::canonicalize(&path).await).unwrap_or_else(|_| path.clone());

        if known_paths.contains(&canon_path) {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_string();

        if known_paths.iter().any(|p| {
            p.file_name().map(|n| n.to_string_lossy())
                == Some(std::borrow::Cow::Borrowed(&folder_name))
        }) {
            continue;
        }

        let clean_name = crate::parser::filename::clean_title(&folder_name).to_lowercase();
        if !clean_name.is_empty() && known_titles.contains(&clean_name) {
            debug!(
                folder = %folder_name,
                reason = "matches_local_title",
                "Skipping folder"
            );
            continue;
        }

        folders.push(UnmappedFolder {
            name: folder_name,
            path: path.to_string_lossy().to_string(),
            size: 0,
            suggested_matches: Vec::new(),
        });
    }

    folders.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(folders)
}

async fn search_and_update_matches(
    state: Arc<RwLock<ScannerState>>,
    folders: &[UnmappedFolder],
    existing_ids: &std::collections::HashSet<i32>,
    event_bus: &tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
) {
    let client = crate::clients::anilist::AnilistClient::new();
    let total = folders.len();

    for (i, folder) in folders.iter().enumerate() {
        let _ = event_bus.send(crate::domain::events::NotificationEvent::ScanProgress {
            current: i + 1,
            total,
        });

        let clean_name = crate::parser::filename::clean_title(&folder.name);
        if clean_name.is_empty() {
            continue;
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;

        let Ok(results) = client.search_anime(&clean_name).await else {
            continue;
        };

        let matches: Vec<SearchResultDto> = results
            .into_iter()
            .take(3)
            .map(|a| SearchResultDto {
                id: a.id,
                title: TitleDto {
                    romaji: a.title.romaji,
                    english: a.title.english,
                    native: a.title.native,
                },
                format: a.format,
                episode_count: a.episode_count,
                status: a.status,
                cover_image: a.cover_image,
                already_in_library: existing_ids.contains(&a.id),
            })
            .collect();

        update_folder_matches(&state, &folder.name, matches, existing_ids).await;
    }
}

async fn update_folder_matches(
    state: &Arc<RwLock<ScannerState>>,
    folder_name: &str,
    matches: Vec<SearchResultDto>,
    existing_ids: &std::collections::HashSet<i32>,
) {
    let mut guard = state.write().await;
    let first_match = matches.first();

    if let Some(m) = first_match
        && existing_ids.contains(&m.id)
    {
        debug!(
            folder = %folder_name,
            match_id = m.id,
            reason = "already_in_library",
            "Filtering out unmapped folder"
        );

        if let Some(pos) = guard.folders.iter().position(|f| f.name == folder_name) {
            guard.folders.remove(pos);
        }
    } else if let Some(f) = guard.folders.iter_mut().find(|f| f.name == folder_name) {
        debug!(
            folder = %folder_name,
            match_id = ?first_match.map(|m| m.id),
            "Keeping unmapped folder"
        );
        f.suggested_matches = matches;
    }
    drop(guard);
}
