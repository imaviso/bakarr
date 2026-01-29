use crate::constants::VIDEO_EXTENSIONS;
use crate::library::LibraryService;
use crate::parser::filename::parse_filename;
use crate::quality::parse_quality_from_filename;
use crate::state::SharedState;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

#[derive(Clone)]
pub struct Monitor {
    state: Arc<RwLock<SharedState>>,
}

impl Monitor {
    pub const fn new(state: Arc<RwLock<SharedState>>) -> Self {
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
        let (qbit, event_bus) = {
            let state = self.state.read().await;
            (state.qbit.clone(), state.event_bus.clone())
        };

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
        let (qbit, config, store) = {
            let state = self.state.read().await;
            (
                state.qbit.clone(),
                state.config.read().await.clone(),
                state.store.clone(),
            )
        };

        let Some(client) = qbit else { return Ok(()) };

        // Optimization removed: We cannot filter by default_category because
        // auto_download.rs creates per-anime categories (e.g. "One Piece").
        // We must fetch all torrents and rely on DB hash lookup to identify ours.
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

        let mut completed_hashes = Vec::new();
        let mut completed_torrents = Vec::new();

        for torrent in torrents {
            if self
                .handle_problematic_torrent(&client, &store, &torrent, &config)
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

            self.process_completed_torrent(&store, &library, &config, &torrent, entry, anime)
                .await?;
        }

        Ok(())
    }

    async fn handle_problematic_torrent(
        &self,
        client: &crate::clients::qbittorrent::QBitClient,
        store: &crate::db::Store,
        torrent: &crate::clients::qbittorrent::TorrentInfo,
        config: &crate::config::Config,
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

        let stalled_threshold = i64::from(config.qbittorrent.stalled_timeout_seconds);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        #[allow(clippy::cast_possible_wrap)]
        let now = now as i64;
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

    async fn process_completed_torrent(
        &self,
        store: &crate::db::Store,
        library: &LibraryService,
        config: &crate::config::Config,
        torrent: &crate::clients::qbittorrent::TorrentInfo,
        entry: Option<&crate::db::DownloadEntry>,
        anime: Option<&crate::models::anime::Anime>,
    ) -> anyhow::Result<()> {
        let start = std::time::Instant::now();
        if let Some(entry) = entry {
            if entry.imported {
                debug!(
                    "Skipping already imported download: {} ({})",
                    torrent.name, torrent.hash
                );
                return Ok(());
            }

            info!(
                "Found completed download (Not imported): {} ({})",
                torrent.name, torrent.hash
            );
        } else {
            debug!(
                "Torrent not found in DB (External download?): {} ({})",
                torrent.name, torrent.hash
            );
            return Ok(());
        }

        let entry = entry.unwrap();
        let Some(anime) = anime else {
            warn!(
                "Anime {} not found for download {}",
                entry.anime_id, entry.id
            );
            return Ok(());
        };

        debug!("Processing import for anime: {}", anime.title.romaji);

        let source_path_str = apply_path_mappings(
            &torrent.content_path,
            &config.downloads.remote_path_mappings,
        );
        let source_path = Path::new(&source_path_str);

        debug!("Resolved source path (Local): {:?}", source_path);

        if !source_path.exists() {
            if self
                .attempt_recovery_import(store, library, anime, entry, source_path)
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

        let import_result = if source_path.is_file() {
            debug!("Source is a single file");
            self.import_single_file(library, anime, source_path, entry)
                .await
        } else if source_path.is_dir() {
            debug!("Source is a directory");
            self.import_directory(library, anime, source_path).await
        } else {
            warn!("Unknown path type for {}: {:?}", torrent.name, source_path);
            return Ok(());
        };

        match import_result {
            Ok(count) => {
                if count > 0 {
                    store.set_imported(entry.id, true).await?;
                    info!(
                        event = "import_success",
                        anime_id = anime.id,
                        anime_title = %anime.title.romaji,
                        torrent_name = %torrent.name,
                        files_imported = count,
                        duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
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

        Ok(())
    }

    async fn attempt_recovery_import(
        &self,
        store: &crate::db::Store,
        library: &LibraryService,
        anime: &crate::models::anime::Anime,
        entry: &crate::db::DownloadEntry,
        source_path: &Path,
    ) -> anyhow::Result<bool> {
        let filename = source_path.file_name().map_or_else(
            || entry.filename.clone(),
            |s| s.to_string_lossy().to_string(),
        );

        let parsed = parse_filename(&filename);
        #[allow(clippy::cast_possible_truncation)]
        let episode_number = parsed.as_ref().map_or(entry.episode_number as i32, |p| {
            #[allow(clippy::cast_possible_truncation)]
            let ep = p.episode_number as i32;
            ep
        });
        let season = parsed.as_ref().and_then(|p| p.season);

        let episode_title = {
            let state = self.state.read().await;
            state
                .episodes
                .get_episode_title(anime.id, episode_number)
                .await
                .unwrap_or_else(|_| format!("Episode {episode_number}"))
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
            group: entry.group_name.clone(),
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
                    if let Some(p) = parse_filename(&name) {
                        #[allow(clippy::cast_possible_truncation)]
                        if p.episode_number as i32 == episode_number {
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
        }

        // DB State Recovery: Check if episode is already marked as downloaded
        if let Ok(Some(status)) = store.get_episode_status(anime.id, episode_number).await
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
    ) -> anyhow::Result<usize> {
        let filename = source_path
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("Invalid source path: no filename"))?
            .to_string_lossy()
            .to_string();

        let parsed = parse_filename(&filename);
        let quality_str = parse_quality_from_filename(&filename).to_string();
        let extension = source_path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        #[allow(clippy::cast_possible_truncation)]
        let default_episode_number = entry.episode_number as i32;

        let episode_number = parsed.as_ref().map_or(default_episode_number, |p| {
            #[allow(clippy::cast_possible_truncation)]
            let ep_num = p.episode_number as i32;
            ep_num
        });

        let season = parsed.as_ref().and_then(|p| p.season);

        let episode_title = {
            let state = self.state.read().await;
            state
                .episodes
                .get_episode_title(anime.id, episode_number)
                .await
                .unwrap_or_else(|_| format!("Episode {episode_number}"))
        };

        let media_service = crate::services::MediaService::new();
        let media_info = media_service.get_media_info(source_path).ok();

        let options = crate::library::RenamingOptions {
            anime: anime.clone(),
            episode_number,
            season,
            episode_title,
            quality: Some(quality_str),
            group: entry.group_name.clone(),
            original_filename: Some(filename.clone()),
            extension,
            year: anime.start_year,
            media_info: media_info.clone(),
        };

        let dest_path = library.get_destination_path(&options);

        library.import_file(source_path, &dest_path).await?;
        info!("Imported to {:?}", dest_path);

        // Persistent log for UI
        if let Err(e) = self
            .state
            .read()
            .await
            .store
            .add_log(
                "import",
                "info",
                &format!("Imported episode: {filename}"),
                Some(format!("Destination: {}", dest_path.display())),
            )
            .await
        {
            warn!("Failed to save import log: {}", e);
        }

        let (seadex_groups, store) = {
            let state = self.state.read().await;
            (
                state.get_seadex_groups_cached(anime.id).await,
                state.store.clone(),
            )
        };

        let is_seadex = {
            let state = self.state.read().await;
            state.is_from_seadex_group(&filename, &seadex_groups)
        };

        let quality = parse_quality_from_filename(&filename);
        let file_size = tokio::fs::metadata(&dest_path)
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

        Ok(1)
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

        let mut imported = 0;

        for file_path in video_files {
            let filename = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let video_ext = file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("mkv");

            let parsed = parse_filename(filename);
            let quality = parse_quality_from_filename(filename).to_string();

            let episode_number = if let Some(ref p) = parsed {
                #[allow(clippy::cast_possible_truncation)]
                let ep = p.episode_number as i32;
                ep
            } else {
                warn!(
                    "Could not detect episode number for {:?}, skipping",
                    file_path
                );
                continue;
            };

            let season = parsed.as_ref().and_then(|p| p.season);

            let media_service = crate::services::MediaService::new();
            let media_info = media_service.get_media_info(&file_path).ok();

            let options = crate::library::RenamingOptions {
                anime: anime.clone(),
                episode_number,
                season,
                episode_title: {
                    let state = self.state.read().await;
                    state
                        .episodes
                        .get_episode_title(anime.id, episode_number)
                        .await
                        .unwrap_or_else(|_| format!("Episode {episode_number}"))
                },
                quality: Some(quality.clone()),
                group: crate::parser::filename::parse_filename(filename).and_then(|r| r.group),
                original_filename: Some(filename.to_string()),
                extension: video_ext.to_string(),
                year: anime.start_year,
                media_info: media_info.clone(),
            };

            let dest_path = library.get_destination_path(&options);

            match library.import_file(&file_path, &dest_path).await {
                Ok(()) => {
                    info!("Imported {} -> {:?}", filename, dest_path);
                    imported += 1;

                    // Persistent log for UI
                    if let Err(e) = self
                        .state
                        .read()
                        .await
                        .store
                        .add_log(
                            "import",
                            "info",
                            &format!("Imported episode: {filename}"),
                            Some(format!("Destination: {}", dest_path.display())),
                        )
                        .await
                    {
                        warn!("Failed to save import log: {}", e);
                    }

                    let (seadex_groups, store) = {
                        let state = self.state.read().await;
                        (
                            state.get_seadex_groups_cached(anime.id).await,
                            state.store.clone(),
                        )
                    };

                    let is_seadex = {
                        let state = self.state.read().await;
                        state.is_from_seadex_group(filename, &seadex_groups)
                    };

                    let quality = parse_quality_from_filename(filename);
                    let file_size = tokio::fs::metadata(&dest_path)
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
                Err(e) => {
                    error!("Failed to import {}: {}", filename, e);
                    if let Err(log_err) = self
                        .state
                        .read()
                        .await
                        .store
                        .add_log(
                            "import",
                            "error",
                            &format!("Failed to import: {filename}"),
                            Some(e.to_string()),
                        )
                        .await
                    {
                        warn!("Failed to save error log: {}", log_err);
                    }
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

    video_files.sort_by(|a, b| {
        a.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .cmp(b.file_name().and_then(|n| n.to_str()).unwrap_or(""))
    });

    Ok(video_files)
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
