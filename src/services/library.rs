use crate::api::SearchResultDto;
use crate::api::TitleDto;
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

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
    event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
}

impl LibraryScannerService {
    pub fn new(
        store: crate::db::Store,
        config: Arc<RwLock<crate::config::Config>>,
        event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
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
            let _ = event_bus.send(crate::api::NotificationEvent::ScanStarted);

            if let Err(e) =
                Self::perform_scan(state.clone(), store, config, event_bus.clone()).await
            {
                eprintln!("Scan failed: {:?}", e);
                let _ = event_bus.send(crate::api::NotificationEvent::Error {
                    message: format!("Scan failed: {}", e),
                });
            }

            let mut guard = state.write().await;
            guard.is_scanning = false;
            guard.last_updated = Some(Utc::now());

            let _ = event_bus.send(crate::api::NotificationEvent::ScanFinished);
        });
    }

    pub async fn scan_library_files(&self) -> anyhow::Result<LibraryScanStats> {
        use crate::determine_quality_id;
        use crate::parser::filename::parse_filename;

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
            .send(crate::api::NotificationEvent::LibraryScanStarted);
        info!("Scanning library: {}", library_path.display());

        let monitored = self.store.list_monitored().await?;

        let mut title_map: std::collections::HashMap<String, crate::models::anime::Anime> =
            std::collections::HashMap::new();
        for anime in &monitored {
            title_map.insert(anime.title.romaji.to_lowercase(), anime.clone());
            if let Some(ref en) = anime.title.english {
                title_map.insert(en.to_lowercase(), anime.clone());
            }
        }

        let video_extensions = ["mkv", "mp4", "avi", "webm", "m4v"];
        let mut stats = LibraryScanStats::default();

        let walker = walkdir::WalkDir::new(&library_path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok());

        for entry in walker {
            let path = entry.path();

            if !path.is_file() {
                continue;
            }

            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();

            if !video_extensions.contains(&extension.as_str()) {
                continue;
            }

            stats.scanned += 1;
            if stats.scanned % 100 == 0 {
                let _ = self
                    .event_bus
                    .send(crate::api::NotificationEvent::LibraryScanProgress {
                        scanned: stats.scanned,
                    });
            }

            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let release = match parse_filename(filename) {
                Some(r) => r,
                None => {
                    continue;
                }
            };

            let (anime, _) =
                self.match_file_to_anime(path, &release, &title_map, Some(&library_path));

            let anime = match anime {
                Some(a) => a,
                None => continue,
            };

            stats.matched += 1;

            let file_size = tokio::fs::metadata(path).await.map(|m| m.len() as i64).ok();
            let episode_number = release.episode_number as i32;
            let season = release.season.unwrap_or(1);

            let quality_id = determine_quality_id(&release);

            let existing = self
                .store
                .get_episode_status(anime.id, episode_number)
                .await?;

            if existing.is_some() {
                continue;
            }

            let media_service = crate::services::MediaService::new();
            let media_info = media_service.get_media_info(path).ok();

            if let Err(e) = self
                .store
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
                .await
            {
                warn!("Failed to mark episode downloaded: {}", e);
                continue;
            }

            stats.updated += 1;
            info!(
                "  Found: {} - Episode {} ({})",
                anime.title.romaji, episode_number, filename
            );
        }

        let _ = self
            .event_bus
            .send(crate::api::NotificationEvent::LibraryScanFinished {
                scanned: stats.scanned,
                matched: stats.matched,
                updated: stats.updated,
            });

        Ok(stats)
    }

    pub fn match_file_to_anime(
        &self,
        file_path: &Path,
        release: &crate::models::release::Release,
        title_map: &std::collections::HashMap<String, crate::models::anime::Anime>,
        import_root: Option<&Path>,
    ) -> (Option<crate::models::anime::Anime>, Option<String>) {
        use crate::parser::filename::clean_title;

        let mut matched = title_map.get(&release.title.to_lowercase()).cloned();

        if matched.is_none() {
            for (title, a) in title_map {
                if release.title.to_lowercase().contains(title)
                    || title.contains(&release.title.to_lowercase())
                {
                    matched = Some(a.clone());
                    break;
                }
            }
        }

        if matched.is_some() {
            return (matched, None);
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

                let is_generic = lower.starts_with("season")
                    || (lower.starts_with("s")
                        && lower.len() > 1
                        && lower.chars().nth(1).is_some_and(|c| c.is_ascii_digit()))
                    || lower == "specials"
                    || lower == "ova"
                    || lower == "ona"
                    || lower == "extras"
                    || lower == "nc";

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
        event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
    ) -> anyhow::Result<()> {
        let (library_path, _profile) = {
            let cfg = config.read().await;
            (
                PathBuf::from(&cfg.library.library_path),
                cfg.profiles.first().cloned(),
            )
        };

        if !library_path.exists() {
            return Err(anyhow::anyhow!("Library path does not exist"));
        }

        let existing_anime = store.list_all_anime().await?;
        let existing_ids: std::collections::HashSet<i32> =
            existing_anime.iter().map(|a| a.id).collect();
        let mut known_paths = std::collections::HashSet::new();
        let mut known_titles = std::collections::HashSet::new();

        for anime in existing_anime {
            let clean_romaji =
                crate::parser::filename::clean_title(&anime.title.romaji).to_lowercase();
            if !clean_romaji.is_empty() {
                known_titles.insert(clean_romaji);
            }
            if let Some(eng) = &anime.title.english {
                let clean_eng = crate::parser::filename::clean_title(eng).to_lowercase();
                if !clean_eng.is_empty() {
                    known_titles.insert(clean_eng);
                }
            }

            if let Some(path) = anime.path {
                if let Ok(canon) = tokio::fs::canonicalize(Path::new(&path)).await {
                    known_paths.insert(canon);
                } else {
                    known_paths.insert(Path::new(&path).to_path_buf());
                }
            }
        }

        let mut initial_folders = Vec::new();
        let mut dir_entries = tokio::fs::read_dir(library_path).await?;

        while let Ok(Some(entry)) = dir_entries.next_entry().await {
            let path = entry.path();
            if path.is_dir() {
                let canon_path = match tokio::fs::canonicalize(&path).await {
                    Ok(p) => p,
                    Err(_) => path.clone(),
                };

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
                    tracing::debug!(
                        "Skipping folder '{}' because it matches a library title locally",
                        folder_name
                    );
                    continue;
                }

                initial_folders.push(UnmappedFolder {
                    name: folder_name,
                    path: path.to_string_lossy().to_string(),
                    size: 0,
                    suggested_matches: Vec::new(),
                });
            }
        }

        initial_folders.sort_by(|a, b| a.name.cmp(&b.name));

        {
            let mut guard = state.write().await;
            guard.folders = initial_folders.clone();
        }

        let client = crate::clients::anilist::AnilistClient::new();

        let total = initial_folders.len();
        for (i, folder) in initial_folders.iter().enumerate() {
            let _ = event_bus.send(crate::api::NotificationEvent::ScanProgress {
                current: i + 1,
                total,
            });

            let clean_name = crate::parser::filename::clean_title(&folder.name);

            if !clean_name.is_empty() {
                tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;

                if let Ok(results) = client.search_anime(&clean_name).await {
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

                    let mut guard = state.write().await;

                    let first_match = matches.first();
                    let should_remove = first_match
                        .map(|m| existing_ids.contains(&m.id))
                        .unwrap_or(false);

                    if should_remove {
                        let match_id = first_match.unwrap().id;
                        tracing::debug!(
                            "Filtering out unmapped folder '{}' because match ID {} is already in library",
                            folder.name,
                            match_id
                        );

                        if let Some(pos) = guard.folders.iter().position(|f| f.name == folder.name)
                        {
                            guard.folders.remove(pos);
                        }
                    } else if let Some(f) = guard.folders.iter_mut().find(|f| f.name == folder.name)
                    {
                        tracing::debug!(
                            "Keeping unmapped folder '{}'. Top match ID {:?}",
                            folder.name,
                            first_match.map(|m| m.id)
                        );
                        f.suggested_matches = matches;
                    }
                }
            }
        }

        Ok(())
    }
}
