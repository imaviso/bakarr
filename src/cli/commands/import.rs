//! Import command handler

use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::clients::anilist::AnilistClient;
use crate::config::Config;
use crate::db::Store;
use crate::library::LibraryService;
use crate::models::anime::Anime;
use crate::models::release::Release;
use crate::parser::filename::parse_filename;
use crate::services::episodes::EpisodeService;
use crate::services::image::{ImageService, ImageType};

pub async fn cmd_import(
    config: &Config,
    path: &str,
    anime_id: Option<i32>,
    dry_run: bool,
) -> anyhow::Result<()> {
    let import_path = Path::new(path);

    if !import_path.exists() {
        println!("Path does not exist: {}", path);
        return Ok(());
    }

    let store = Store::new(&config.general.database_path).await?;
    store.initialize_quality_system(config).await?;
    let library = LibraryService::new(config.library.clone());

    let (tx, _) = tokio::sync::broadcast::channel(1);
    let scanner_service = crate::services::LibraryScannerService::new(
        store.clone(),
        Arc::new(RwLock::new(config.clone())),
        tx,
    );
    let anilist = AnilistClient::new();

    let target_anime = if let Some(id) = anime_id {
        match store.get_anime(id).await? {
            Some(a) => Some(a),
            None => {
                println!("Anime with ID {} not found.", id);
                return Ok(());
            }
        }
    } else {
        None
    };

    let video_extensions = crate::constants::VIDEO_EXTENSIONS;
    let mut files_to_import: Vec<(std::path::PathBuf, Release, Anime)> = Vec::new();

    let entries: Vec<_> = if import_path.is_file() {
        vec![import_path.to_path_buf()]
    } else {
        walkdir::WalkDir::new(import_path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .map(|e| e.path().to_path_buf())
            .collect()
    };

    let mut monitored = store.list_monitored().await?;
    let mut title_map: HashMap<String, Anime> = HashMap::new();

    let rebuild_map = |m: &[Anime], map: &mut HashMap<String, Anime>| {
        map.clear();
        for anime in m {
            map.insert(anime.title.romaji.to_lowercase(), anime.clone());
            if let Some(ref en) = anime.title.english {
                map.insert(en.to_lowercase(), anime.clone());
            }
        }
    };

    rebuild_map(&monitored, &mut title_map);

    let mut searched_directories: HashSet<String> = HashSet::new();

    for file_path in entries {
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !video_extensions.contains(&extension.as_str()) {
            continue;
        }

        let filename = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let release = match parse_filename(filename) {
            Some(r) => r,
            None => {
                println!("  Skip (unparseable): {}", filename);
                continue;
            }
        };

        let anime = if let Some(ref a) = target_anime {
            a.clone()
        } else {
            let (match_result, directory_title) = scanner_service.match_file_to_anime(
                &file_path,
                &release,
                &title_map,
                Some(import_path),
            );
            let mut matched = match_result;

            if matched.is_none() {
                let search_query = directory_title.as_ref().unwrap_or(&release.title);
                let search_key = search_query.to_lowercase();

                if !searched_directories.contains(&search_key) {
                    searched_directories.insert(search_key.clone());

                    print!(
                        "  No local match for \"{}\". Search AniList? [Y/n] ",
                        search_query
                    );
                    std::io::stdout().flush()?;

                    let mut input = String::new();
                    std::io::stdin().read_line(&mut input)?;

                    if input.trim().is_empty() || input.trim().eq_ignore_ascii_case("y") {
                        match anilist.search_anime(search_query).await {
                            Ok(results) => {
                                if let Some(best) = results.first() {
                                    println!("    Found: {} ({})", best.title.romaji, best.id);
                                    print!("    Add to library and import? [Y/n] ");
                                    std::io::stdout().flush()?;

                                    let mut confirm = String::new();
                                    std::io::stdin().read_line(&mut confirm)?;

                                    if confirm.trim().is_empty()
                                        || confirm.trim().eq_ignore_ascii_case("y")
                                    {
                                        if !dry_run {
                                            let image_service = ImageService::new(config.clone());
                                            let mut anime_to_add = best.clone();

                                            if let Some(url) = &anime_to_add.cover_image {
                                                match image_service
                                                    .save_image(
                                                        url,
                                                        anime_to_add.id,
                                                        ImageType::Cover,
                                                    )
                                                    .await
                                                {
                                                    Ok(path) => {
                                                        anime_to_add.cover_image = Some(path)
                                                    }
                                                    Err(e) => println!(
                                                        "Warning: Failed to download cover image: {}",
                                                        e
                                                    ),
                                                }
                                            }

                                            if let Some(url) = &anime_to_add.banner_image {
                                                match image_service
                                                    .save_image(
                                                        url,
                                                        anime_to_add.id,
                                                        ImageType::Banner,
                                                    )
                                                    .await
                                                {
                                                    Ok(path) => {
                                                        anime_to_add.banner_image = Some(path)
                                                    }
                                                    Err(e) => println!(
                                                        "Warning: Failed to download banner image: {}",
                                                        e
                                                    ),
                                                }
                                            }

                                            store.add_anime(&anime_to_add).await?;
                                            println!(
                                                "    Added {} to library.",
                                                anime_to_add.title.romaji
                                            );

                                            monitored.push(anime_to_add.clone());
                                            rebuild_map(&monitored, &mut title_map);

                                            matched = Some(anime_to_add);
                                        } else {
                                            println!(
                                                "    [Dry Run] Would add {} to library.",
                                                best.title.romaji
                                            );

                                            let mock = best.clone();
                                            matched = Some(mock);
                                        }
                                    }
                                } else {
                                    println!("    No results found on AniList.");
                                }
                            }
                            Err(e) => {
                                println!("    AniList search failed: {}", e);
                            }
                        }
                    }
                }
            }

            match matched {
                Some(a) => a,
                None => {
                    println!(
                        "  Skip (no match): {} -> \"{}\" (Dir: {:?})",
                        filename, release.title, directory_title
                    );
                    continue;
                }
            }
        };

        files_to_import.push((file_path, release, anime));
    }

    if files_to_import.is_empty() {
        println!("No importable video files found.");
        return Ok(());
    }

    let episode_service = EpisodeService::new(store.clone());

    println!("\nPlan:");
    println!("{:-<70}", "");

    for (file_path, release, anime) in &files_to_import {
        let episode = release.episode_number as i32;
        let season = release.season.unwrap_or(1);

        let episode_title = episode_service
            .get_episode_title(anime.id, episode)
            .await
            .unwrap_or_else(|_| format!("Episode {}", episode));

        let height = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let quality = crate::quality::parse_quality_from_filename(&height).to_string();

        let options = crate::library::RenamingOptions {
            anime: anime.clone(),
            episode_number: episode,
            season: Some(season),
            episode_title,
            quality: Some(quality),
            group: None,
            original_filename: Some(height),
            extension: file_path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            year: anime.start_year,
            media_info: None,
        };

        let dest = library.get_destination_path(&options);

        println!("  {} -> S{:02}E{:02}", anime.title.romaji, season, episode);
        println!("    From: {}", file_path.display());
        println!("    To:   {}", dest.display());
        println!();
    }

    if dry_run {
        println!("Dry run - no files were imported.");
        println!("Remove --dry-run to actually import files.");
        return Ok(());
    }

    println!("Import {} files? (y/N): ", files_to_import.len());
    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;

    if !input.trim().eq_ignore_ascii_case("y") {
        println!("Cancelled.");
        return Ok(());
    }

    let mut imported = 0;
    let mut failed = 0;

    for (file_path, release, anime) in files_to_import {
        let episode = release.episode_number as i32;
        let season = release.season.unwrap_or(1);

        let episode_title = episode_service
            .get_episode_title(anime.id, episode)
            .await
            .unwrap_or_else(|_| format!("Episode {}", episode));

        let height = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let quality = crate::quality::parse_quality_from_filename(&height).to_string();

        let media_service = crate::services::MediaService::new();
        let media_info = media_service.get_media_info(&file_path).ok();

        let options = crate::library::RenamingOptions {
            anime: anime.clone(),
            episode_number: episode,
            season: Some(season),
            episode_title,
            quality: Some(quality),
            group: release.group.clone(),
            original_filename: Some(height),
            extension: file_path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            year: anime.start_year,
            media_info: media_info.clone(),
        };

        let dest = library.get_destination_path(&options);

        match library.import_file(&file_path, &dest).await {
            Ok(_) => {
                let file_size = tokio::fs::metadata(&dest)
                    .await
                    .map(|m| m.len() as i64)
                    .ok();
                let quality_id = crate::quality::determine_quality_id(&release);

                store
                    .mark_episode_downloaded(
                        anime.id,
                        episode,
                        season,
                        quality_id,
                        false,
                        dest.to_str().unwrap_or(""),
                        file_size,
                        media_info.as_ref(),
                    )
                    .await?;

                store
                    .record_download(
                        anime.id,
                        file_path.file_name().and_then(|n| n.to_str()).unwrap_or(""),
                        release.episode_number,
                        release.group.as_deref(),
                        None,
                    )
                    .await?;

                imported += 1;
                println!("  Imported: {} E{:02}", anime.title.romaji, episode);
            }
            Err(e) => {
                failed += 1;
                println!("  Failed: {} - {}", file_path.display(), e);
            }
        }
    }

    println!();
    println!("{:-<70}", "");
    println!("Import complete!");
    println!("  Imported: {}", imported);
    if failed > 0 {
        println!("  Failed:   {}", failed);
    }

    Ok(())
}
