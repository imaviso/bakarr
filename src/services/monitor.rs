use crate::constants::VIDEO_EXTENSIONS;
use crate::library::LibraryService;
use crate::parser::filename::parse_filename;
use crate::quality::parse_quality_from_filename;
use crate::state::SharedState;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info, warn};

#[derive(Clone)]
pub struct Monitor {
    state: Arc<SharedState>,
}

/// Context for importing a single video file, extracted to eliminate DRY violations
/// between `import_single_file` and `import_directory`.
struct ImportContext<'a> {
    anime: &'a crate::models::anime::Anime,
    file_path: &'a Path,
    filename: &'a str,
    episode_number: i32,
    season: Option<i32>,
    quality: String,
    extension: String,
    group: Option<String>,
    media_info: Option<crate::models::media::MediaInfo>,
    episode_title: String,
}

impl Monitor {
    #[must_use]
    pub const fn new(state: Arc<SharedState>) -> Self {
        Self { state }
    }

    pub async fn start(&self) {
        tokio::time::sleep(Duration::from_secs(10)).await;

        let monitor = self.clone();
        tokio::spawn(async move {
            monitor.import_loop().await;
        });

        let monitor = self.clone();
        tokio::spawn(async move {
            monitor.progress_loop().await;
        });
    }

    async fn import_loop(&self) {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        info!("Import monitor loop started");

        loop {
            interval.tick().await;
            if let Err(e) = self.check_downloads().await {
                error!("Monitor import check failed: {}", e);
            }
        }
    }

    async fn progress_loop(&self) {
        let mut interval = tokio::time::interval(Duration::from_secs(2));
        info!("Download progress loop started");

        loop {
            interval.tick().await;
            if let Err(e) = self.broadcast_progress().await {
                warn!("Monitor progress check failed: {}. Retrying in 30s.", e);
                tokio::time::sleep(Duration::from_secs(30)).await;
            }
        }
    }

    async fn broadcast_progress(&self) -> anyhow::Result<()> {
        let (qbit, event_bus) = (self.state.qbit.clone(), self.state.event_bus.clone());

        let Some(client) = qbit else { return Ok(()) };

        // Optimization: Filter by "downloading" on the server side
        // This dramatically reduces the payload size every 2 seconds
        let torrents = client.get_torrents(Some("downloading"), None).await?;

        let downloads: Vec<crate::api::events::DownloadStatus> = torrents
            .into_iter()
            .map(|t| {
                #[allow(clippy::cast_possible_truncation)]
                let progress = t.progress as f32;
                crate::api::events::DownloadStatus {
                    hash: t.hash,
                    name: t.name,
                    progress,
                    speed: t.dlspeed,
                    eta: t.eta,
                    state: format!("{:?}", t.state),
                    total_bytes: t.size,
                    downloaded_bytes: t.downloaded,
                }
            })
            .collect();

        if !downloads.is_empty() {
            let _ = event_bus
                .send(crate::api::events::NotificationEvent::DownloadProgress { downloads });
        }

        Ok(())
    }

    async fn check_downloads(&self) -> anyhow::Result<()> {
        let (qbit, config_arc, store) = (
            self.state.qbit.clone(),
            self.state.config.clone(),
            self.state.store.clone(),
        );

        let Some(client) = qbit else { return Ok(()) };
        let config = config_arc.read().await;

        let torrents = match client.get_torrents(None, None).await {
            Ok(t) => {
                debug!("Fetched {} torrents from qBittorrent", t.len());
                t
            }
            Err(e) => {
                error!("Failed to fetch torrents: {}", e);
                return Ok(());
            }
        };

        let library = LibraryService::new(config.library.clone());
        drop(config); // Release config lock before potentially long DB/IO operations

        let mut completed_hashes = Vec::new();
        let mut completed_torrents = Vec::new();

        let stalled_threshold = {
            let config = config_arc.read().await;
            i64::from(config.qbittorrent.stalled_timeout_seconds)
        };

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        #[allow(clippy::cast_possible_wrap)]
        let now = now as i64;

        for torrent in torrents {
            if self
                .handle_problematic_torrent(&client, &store, &torrent, stalled_threshold, now)
                .await?
            {
                continue;
            }

            if torrent.progress < 1.0 {
                continue;
            }

            completed_hashes.push(torrent.hash.to_lowercase());
            completed_hashes.push(torrent.hash.to_uppercase());
            completed_torrents.push(torrent);
        }

        if completed_hashes.is_empty() {
            return Ok(());
        }

        let entries = store.get_downloads_by_hashes(&completed_hashes).await?;

        // Batch Fetch Logic
        let mut pairs = Vec::new();
        for entry in &entries {
            pairs.push((entry.anime_id, entry.episode_number_truncated()));
        }
        pairs.sort_unstable();
        pairs.dedup();

        let titles_map = self.state.episodes.get_episode_titles_batch(&pairs).await?;
        let statuses_map = store.get_episode_statuses_batch(&pairs).await?;

        let mut anime_ids: Vec<i32> = entries.iter().map(|e| e.anime_id).collect();
        anime_ids.sort_unstable();
        anime_ids.dedup();

        let animes = store.get_animes_by_ids(&anime_ids).await?;
        let anime_map: std::collections::HashMap<i32, crate::models::anime::Anime> =
            animes.into_iter().map(|a| (a.id, a)).collect();

        let entries_map: std::collections::HashMap<String, crate::db::DownloadEntry> = entries
            .into_iter()
            .filter_map(|e| e.info_hash.clone().map(|h| (h.to_lowercase(), e)))
            .collect();

        for torrent in completed_torrents {
            let entry = entries_map.get(&torrent.hash.to_lowercase());
            let anime = entry.and_then(|e| anime_map.get(&e.anime_id));

            // Lookup preloaded data
            let (preloaded_title, preloaded_status) = entry.map_or((None, None), |e| {
                let key = (e.anime_id, e.episode_number_truncated());
                (
                    titles_map.get(&key).cloned(),
                    statuses_map.get(&key).cloned(),
                )
            });

            let config = config_arc.read().await;
            self.process_completed_torrent(
                &store,
                &library,
                &config,
                &torrent,
                entry,
                anime,
                preloaded_title,
                preloaded_status,
            )
            .await?;
        }

        Ok(())
    }

    async fn handle_problematic_torrent(
        &self,
        client: &crate::clients::qbittorrent::QBitClient,
        store: &crate::db::Store,
        torrent: &crate::clients::qbittorrent::TorrentInfo,
        stalled_threshold: i64,
        now: i64,
    ) -> anyhow::Result<bool> {
        let is_stalled = matches!(
            torrent.state,
            crate::clients::qbittorrent::TorrentState::StalledDL
                | crate::clients::qbittorrent::TorrentState::MetaDL
        ) && torrent.num_seeds == 0;

        let is_error = matches!(
            torrent.state,
            crate::clients::qbittorrent::TorrentState::Error
                | crate::clients::qbittorrent::TorrentState::MissingFiles
        );

        let duration_since_added = now - torrent.added_on;

        if !(is_error || is_stalled && duration_since_added > stalled_threshold) {
            return Ok(false);
        }

        let reason = if is_error {
            "Download Error"
        } else {
            "Stalled (0 seeds)"
        };

        warn!(
            "Removing {} download: {} ({}) - Added {}s ago",
            reason, torrent.name, torrent.hash, duration_since_added
        );

        if let Err(e) = client.delete_torrent(&torrent.hash, true).await {
            error!("Failed to delete stalled torrent {}: {}", torrent.hash, e);
            return Ok(false);
        }

        if let Err(e) = store.add_to_blocklist(&torrent.hash, reason).await {
            error!("Failed to blocklist torrent {}: {}", torrent.hash, e);
        }

        Ok(true)
    }

    /// High-level flow for processing a completed torrent:
    /// 1. Validate Entry
    /// 2. Resolve Path
    /// 3. Recover (if missing)
    /// 4. Execute Import
    /// 5. Finalize
    #[allow(clippy::too_many_arguments)]
    async fn process_completed_torrent(
        &self,
        store: &crate::db::Store,
        library: &LibraryService,
        config: &crate::config::Config,
        torrent: &crate::clients::qbittorrent::TorrentInfo,
        entry: Option<&crate::db::DownloadEntry>,
        anime: Option<&crate::models::anime::Anime>,
        preloaded_title: Option<String>,
        preloaded_status: Option<crate::models::episode::EpisodeStatusRow>,
    ) -> anyhow::Result<()> {
        let start = std::time::Instant::now();

        // Step 1: Validate Entry
        let Some(entry) = self.validate_entry(torrent, entry) else {
            return Ok(());
        };

        let Some(anime) = anime else {
            warn!(
                "Anime {} not found for download {}",
                entry.anime_id, entry.id
            );
            return Ok(());
        };

        debug!("Processing import for anime: {}", anime.title.romaji);

        // Step 2: Resolve Path
        let source_path = self.resolve_source_path(torrent, config);
        debug!("Resolved source path (Local): {:?}", source_path);

        // Step 3: Recover (if missing)
        if !source_path.exists() {
            if self
                .attempt_recovery_import(
                    store,
                    library,
                    anime,
                    entry,
                    &source_path,
                    preloaded_title.clone(),
                    preloaded_status,
                )
                .await?
            {
                return Ok(());
            }

            warn!(
                "Source path does not exist for {}: {:?}",
                torrent.name, source_path
            );
            return Ok(());
        }

        // Step 4: Execute Import
        let import_result = self
            .execute_import(library, anime, &source_path, entry, preloaded_title)
            .await;

        // Step 5: Finalize
        self.finalize_import_result(import_result, store, entry, anime, torrent, start.elapsed())
            .await;

        Ok(())
    }

    /// Validates the entry and returns true if import should proceed.
    /// Logs appropriate messages based on entry state.
    #[allow(clippy::unused_self)]
    fn validate_entry<'a>(
        &self,
        torrent: &crate::clients::qbittorrent::TorrentInfo,
        entry: Option<&'a crate::db::DownloadEntry>,
    ) -> Option<&'a crate::db::DownloadEntry> {
        if let Some(entry) = entry {
            if entry.imported {
                debug!(
                    "Skipping already imported download: {} ({})",
                    torrent.name, torrent.hash
                );
                return None;
            }

            info!(
                "Found completed download (Not imported): {} ({})",
                torrent.name, torrent.hash
            );
            Some(entry)
        } else {
            debug!(
                "Torrent not found in DB (External download?): {} ({})",
                torrent.name, torrent.hash
            );
            None
        }
    }

    /// Resolves the source path by applying path mappings.
    #[allow(clippy::unused_self)]
    fn resolve_source_path(
        &self,
        torrent: &crate::clients::qbittorrent::TorrentInfo,
        config: &crate::config::Config,
    ) -> PathBuf {
        let source_path_str = apply_path_mappings(
            &torrent.content_path,
            &config.downloads.remote_path_mappings,
        );
        PathBuf::from(source_path_str)
    }

    /// Executes the import operation (single file or directory).
    async fn execute_import(
        &self,
        library: &LibraryService,
        anime: &crate::models::anime::Anime,
        source_path: &Path,
        entry: &crate::db::DownloadEntry,
        preloaded_title: Option<String>,
    ) -> anyhow::Result<usize> {
        if source_path.is_file() {
            debug!("Source is a single file");
            self.import_single_file(library, anime, source_path, entry, preloaded_title)
                .await
        } else if source_path.is_dir() {
            debug!("Source is a directory");
            self.import_directory(library, anime, source_path).await
        } else {
            Err(anyhow::anyhow!(
                "Unknown path type: {}",
                source_path.display()
            ))
        }
    }

    /// Finalizes the import result: logs outcome, marks as imported, and updates DB.
    async fn finalize_import_result(
        &self,
        result: anyhow::Result<usize>,
        store: &crate::db::Store,
        entry: &crate::db::DownloadEntry,
        anime: &crate::models::anime::Anime,
        torrent: &crate::clients::qbittorrent::TorrentInfo,
        duration: std::time::Duration,
    ) {
        match result {
            Ok(count) => {
                if count > 0 {
                    if let Err(e) = store.set_imported(entry.id, true).await {
                        warn!("Failed to mark download as imported: {}", e);
                    }
                    info!(
                        event = "import_success",
                        anime_id = anime.id,
                        anime_title = %anime.title.romaji,
                        torrent_name = %torrent.name,
                        files_imported = count,
                        duration_ms = u64::try_from(duration.as_millis()).unwrap_or(u64::MAX),
                        "Successfully imported files"
                    );
                } else {
                    warn!(
                        event = "import_warn",
                        reason = "no_files_found",
                        torrent_name = %torrent.name,
                        "No video files found"
                    );
                }
            }
            Err(e) => {
                error!(
                    event = "import_error",
                    error = %e,
                    torrent_name = %torrent.name,
                    "Failed to import"
                );
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn attempt_recovery_import(
        &self,
        store: &crate::db::Store,
        library: &LibraryService,
        anime: &crate::models::anime::Anime,
        entry: &crate::db::DownloadEntry,
        source_path: &Path,
        preloaded_title: Option<String>,
        preloaded_status: Option<crate::models::episode::EpisodeStatusRow>,
    ) -> anyhow::Result<bool> {
        let filename = source_path.file_name().map_or_else(
            || entry.filename.clone(),
            |s| s.to_string_lossy().to_string(),
        );

        let parsed = parse_filename(&filename);
        // Use truncation for episode numbers to match database storage format
        // Partial episodes (e.g., 6.5) are stored as their integer base (6)
        let episode_number = parsed.as_ref().map_or_else(
            || entry.episode_number_truncated(),
            crate::models::release::Release::episode_number_truncated,
        );
        let season = parsed.as_ref().and_then(|p| p.season);

        let use_preloaded = episode_number == entry.episode_number_truncated();

        let episode_title = match (use_preloaded, preloaded_title) {
            (true, Some(title)) => title,
            _ => self
                .state
                .episodes
                .get_episode_title(anime.id, episode_number)
                .await
                .unwrap_or_else(|_| format!("Episode {episode_number}")),
        };

        let quality_str = parse_quality_from_filename(&filename).to_string();
        let extension = source_path
            .extension()
            .map_or_else(|| "mkv".to_string(), |s| s.to_string_lossy().to_string());

        let options = crate::library::RenamingOptions {
            anime: anime.clone(),
            episode_number,
            season,
            episode_title,
            quality: Some(quality_str),
            group: entry
                .group_name
                .clone()
                .or_else(|| parsed.as_ref().and_then(|p| p.group.clone())),
            original_filename: Some(filename.clone()),
            extension,
            year: anime.start_year,
            media_info: None,
        };

        let dest_path = library.get_destination_path(&options);

        if dest_path.exists() {
            info!(
                "Source missing but destination exists. Marking as imported: {:?}",
                dest_path
            );
            store.set_imported(entry.id, true).await?;
            return Ok(true);
        }

        // Fuzzy Recovery: Check parent dir for matching episode number
        // This handles cases where file was renamed (e.g. metadata/title update)
        if let Some(parent) = dest_path.parent()
            && parent.exists()
            && let Ok(mut entries) = tokio::fs::read_dir(parent).await
        {
            while let Ok(Some(file_entry)) = entries.next_entry().await {
                let path = file_entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy();
                    if let Some(p) = parse_filename(&name)
                        && p.episode_number_truncated() == episode_number
                    {
                        // Verify season if available
                        if let Some(s) = season
                            && p.season.is_some()
                            && p.season != Some(s)
                        {
                            continue;
                        }

                        info!("Found renamed file for recovery: {:?}", path);
                        store.set_imported(entry.id, true).await?;
                        return Ok(true);
                    }
                }
            }
        }

        // DB State Recovery: Check if episode is already marked as downloaded
        let status_check = if use_preloaded && preloaded_status.is_some() {
            preloaded_status
        } else {
            store.get_episode_status(anime.id, episode_number).await?
        };

        if let Some(status) = status_check
            && status.downloaded_at.is_some()
        {
            info!("Episode already marked as downloaded in DB. Marking download as imported.");
            store.set_imported(entry.id, true).await?;
            return Ok(true);
        }

        warn!(
            "Recovery check failed: Filename='{}', Ep={}, Dest='{:?}' (Missing), AnimePath='{:?}'",
            filename, episode_number, dest_path, anime.path
        );
        Ok(false)
    }

    async fn import_single_file(
        &self,
        library: &LibraryService,
        anime: &crate::models::anime::Anime,
        source_path: &Path,
        entry: &crate::db::DownloadEntry,
        preloaded_title: Option<String>,
    ) -> anyhow::Result<usize> {
        let filename = source_path
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("Invalid source path: no filename"))?
            .to_string_lossy()
            .to_string();

        let parsed = parse_filename(&filename);
        let quality = parse_quality_from_filename(&filename).to_string();
        let extension = source_path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Truncate episode numbers to match database storage format
        let episode_number = parsed.as_ref().map_or_else(
            || entry.episode_number_truncated(),
            crate::models::release::Release::episode_number_truncated,
        );

        let season = parsed.as_ref().and_then(|p| p.season);

        // Use preloaded title if episode number matches entry
        let episode_title = match (
            episode_number == entry.episode_number_truncated(),
            preloaded_title,
        ) {
            (true, Some(title)) => title,
            _ => self
                .state
                .episodes
                .get_episode_title(anime.id, episode_number)
                .await
                .unwrap_or_else(|_| format!("Episode {episode_number}")),
        };

        let media_service = crate::services::MediaService::new();
        let media_info = media_service.get_media_info(source_path).await.ok();

        let group = entry
            .group_name
            .clone()
            .or_else(|| parsed.as_ref().and_then(|p| p.group.clone()));

        let ctx = ImportContext {
            anime,
            file_path: source_path,
            filename: &filename,
            episode_number,
            season,
            quality,
            extension,
            group,
            media_info,
            episode_title,
        };

        self.execute_single_import(library, ctx).await?;
        Ok(1)
    }

    /// Common finalization logic for a single file import.
    async fn finalize_single_import(
        &self,
        anime: &crate::models::anime::Anime,
        filename: &str,
        dest_path: &Path,
        episode_number: i32,
        season: Option<i32>,
        media_info: Option<crate::models::media::MediaInfo>,
    ) {
        let seadex_groups = self.state.get_seadex_groups_cached(anime.id).await;
        let store = self.state.store.clone();
        let is_seadex = self.state.is_from_seadex_group(filename, &seadex_groups);

        let quality = parse_quality_from_filename(filename);
        let file_size = tokio::fs::metadata(dest_path)
            .await
            .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
            .ok();

        if let Err(e) = store
            .mark_episode_downloaded(
                anime.id,
                episode_number,
                season.unwrap_or(1),
                quality.id,
                is_seadex,
                dest_path.to_str().unwrap_or(""),
                file_size,
                media_info.as_ref(),
            )
            .await
        {
            warn!("Failed to update episode status: {}", e);
        }
    }

    /// Executes the import for a single file using pre-built context.
    /// This consolidates the common logic between `import_single_file` and `import_directory`.
    async fn execute_single_import(
        &self,
        library: &LibraryService,
        ctx: ImportContext<'_>,
    ) -> anyhow::Result<()> {
        let options = crate::library::RenamingOptions {
            anime: ctx.anime.clone(),
            episode_number: ctx.episode_number,
            season: ctx.season,
            episode_title: ctx.episode_title.clone(),
            quality: Some(ctx.quality.clone()),
            group: ctx.group.clone(),
            original_filename: Some(ctx.filename.to_string()),
            extension: ctx.extension.clone(),
            year: ctx.anime.start_year,
            media_info: ctx.media_info.clone(),
        };

        let dest_path = library.get_destination_path(&options);

        library.import_file(ctx.file_path, &dest_path).await?;
        info!("Imported to {:?}", dest_path);

        // Persistent log for UI
        if let Err(e) = self
            .state
            .store
            .add_log(
                "import",
                "info",
                &format!("Imported episode: {}", ctx.filename),
                Some(format!("Destination: {}", dest_path.display())),
            )
            .await
        {
            warn!("Failed to save import log: {}", e);
        }

        self.finalize_single_import(
            ctx.anime,
            ctx.filename,
            &dest_path,
            ctx.episode_number,
            ctx.season,
            ctx.media_info,
        )
        .await;

        Ok(())
    }

    /// Logs an import error and persists it to the store.
    async fn log_import_error(&self, filename: &str, error: &anyhow::Error) {
        error!("Failed to import {}: {}", filename, error);
        if let Err(log_err) = self
            .state
            .store
            .add_log(
                "import",
                "error",
                &format!("Failed to import: {filename}"),
                Some(error.to_string()),
            )
            .await
        {
            warn!("Failed to save error log: {}", log_err);
        }
    }

    #[allow(clippy::too_many_lines)]
    async fn import_directory(
        &self,
        library: &LibraryService,
        anime: &crate::models::anime::Anime,
        dir_path: &Path,
    ) -> anyhow::Result<usize> {
        let video_files = find_video_files_recursive(dir_path).await?;

        if video_files.is_empty() {
            return Ok(0);
        }

        info!(
            "Found {} video file(s) in directory {:?}",
            video_files.len(),
            dir_path
        );

        // Pass 1: Parse and collect needed episodes for batch fetching
        let mut episode_numbers = Vec::new();
        for file_path in &video_files {
            let filename = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if let Some(parsed) = parse_filename(filename) {
                episode_numbers.push((anime.id, parsed.episode_number_truncated()));
            }
        }
        episode_numbers.sort_unstable();
        episode_numbers.dedup();

        let titles_map = self
            .state
            .episodes
            .get_episode_titles_batch(&episode_numbers)
            .await?;

        let mut imported = 0;

        // Pass 2: Process files using cached titles
        for file_path in video_files {
            let filename = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let video_ext = file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("mkv");

            let parsed = parse_filename(filename);
            let quality = parse_quality_from_filename(filename).to_string();

            let episode_number = if let Some(ref p) = parsed {
                p.episode_number_truncated()
            } else {
                warn!(
                    "Could not detect episode number for {:?}, skipping",
                    file_path
                );
                continue;
            };

            let season = parsed.as_ref().and_then(|p| p.season);

            let media_service = crate::services::MediaService::new();
            let media_info = media_service.get_media_info(&file_path).await.ok();

            let group = parsed.as_ref().and_then(|p| p.group.clone());

            let episode_title = titles_map
                .get(&(anime.id, episode_number))
                .cloned()
                .unwrap_or_else(|| format!("Episode {episode_number}"));

            let ctx = ImportContext {
                anime,
                file_path: &file_path,
                filename,
                episode_number,
                season,
                quality,
                extension: video_ext.to_string(),
                group,
                media_info,
                episode_title,
            };

            match self.execute_single_import(library, ctx).await {
                Ok(()) => {
                    imported += 1;
                }
                Err(e) => {
                    self.log_import_error(filename, &e).await;
                }
            }
        }

        Ok(imported)
    }
}

fn apply_path_mappings(path: &str, mappings: &[(String, String)]) -> String {
    let mut result = path.to_string();
    for (remote, local) in mappings {
        if result.starts_with(remote) {
            tracing::debug!(
                "Applying path mapping: {} -> {} for {}",
                remote,
                local,
                result
            );
            result = result.replacen(remote, local, 1);
            break;
        }
    }
    result
}

async fn find_video_files_recursive(dir: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut video_files = Vec::new();
    let mut stack = vec![dir.to_path_buf()];

    while let Some(current_dir) = stack.pop() {
        let mut entries = tokio::fs::read_dir(&current_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let file_type = entry.file_type().await?;

            if file_type.is_dir() {
                stack.push(path);
            } else if file_type.is_file()
                && let Some(ext) = path.extension().and_then(|e| e.to_str())
                && VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str())
            {
                video_files.push(path);
            }
        }
    }

    // Sorting can be CPU-intensive with many files; offload to blocking thread
    let sorted_files = tokio::task::spawn_blocking(move || {
        video_files.sort_by(|a, b| {
            a.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .cmp(b.file_name().and_then(|n| n.to_str()).unwrap_or(""))
        });
        video_files
    })
    .await?;

    Ok(sorted_files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_video_extensions() {
        assert!(VIDEO_EXTENSIONS.contains(&"mkv"));
        assert!(VIDEO_EXTENSIONS.contains(&"mp4"));
        assert!(!VIDEO_EXTENSIONS.contains(&"txt"));
    }
}
