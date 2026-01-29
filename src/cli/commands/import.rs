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
        println!("Path does not exist: {path}");
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
    let anilist = Arc::new(AnilistClient::new());
    let jikan = Arc::new(crate::clients::jikan::JikanClient::new());

    let target_anime = if let Some(id) = anime_id {
        let Some(a) = store.get_anime(id).await? else {
            println!("Anime with ID {id} not found.");
            return Ok(());
        };
        Some(a)
    } else {
        None
    };

    let mut monitored = store.list_monitored().await?;
    let mut title_map: HashMap<String, Anime> = HashMap::new();
    rebuild_map(&monitored, &mut title_map);

    let mut ctx = ImportContext {
        monitored: &mut monitored,
        title_map: &mut title_map,
        scanner_service: &scanner_service,
        anilist: &anilist,
        store: &store,
        config,
    };

    let files_to_import =
        collect_import_candidates(import_path, target_anime.as_ref(), &mut ctx, dry_run).await?;

    if files_to_import.is_empty() {
        println!("No importable video files found.");
        return Ok(());
    }

    let episode_service = EpisodeService::new(store.clone(), jikan, anilist, None);

    display_import_plan(&files_to_import, &library, &episode_service).await;

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

    let (imported, failed) =
        execute_import(&files_to_import, &library, &episode_service, &store).await?;

    println!();
    println!("{:-<70}", "");
    println!("Import complete!");
    println!("  Imported: {imported}");
    if failed > 0 {
        println!("  Failed:   {failed}");
    }

    Ok(())
}

struct ImportContext<'a> {
    monitored: &'a mut Vec<Anime>,
    title_map: &'a mut HashMap<String, Anime>,
    scanner_service: &'a crate::services::LibraryScannerService,
    anilist: &'a AnilistClient,
    store: &'a Store,
    config: &'a Config,
}

async fn collect_import_candidates(
    import_path: &Path,
    target_anime: Option<&Anime>,
    ctx: &mut ImportContext<'_>,
    dry_run: bool,
) -> anyhow::Result<Vec<(std::path::PathBuf, Release, Anime)>> {
    let video_extensions = crate::constants::VIDEO_EXTENSIONS;
    let mut files_to_import = Vec::new();

    let entries: Vec<_> = if import_path.is_file() {
        vec![import_path.to_path_buf()]
    } else {
        walkdir::WalkDir::new(import_path)
            .follow_links(true)
            .into_iter()
            .filter_map(std::result::Result::ok)
            .filter(|e| e.path().is_file())
            .map(|e| e.path().to_path_buf())
            .collect()
    };

    let mut searched_directories: HashSet<String> = HashSet::new();

    for file_path in entries {
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_lowercase)
            .unwrap_or_default();

        if !video_extensions.contains(&extension.as_str()) {
            continue;
        }

        let filename = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let Some(release) = parse_filename(filename) else {
            println!("  Skip (unparseable): {filename}");
            continue;
        };

        let Some(anime) = resolve_anime_for_file(
            &file_path,
            &release,
            ctx.monitored,
            ctx.title_map,
            &mut searched_directories,
            import_path,
            target_anime,
            ctx.scanner_service,
            ctx.anilist,
            ctx.store,
            ctx.config,
            dry_run,
        )
        .await?
        else {
            continue;
        };

        files_to_import.push((file_path, release, anime));
    }

    Ok(files_to_import)
}

async fn display_import_plan(
    files_to_import: &[(std::path::PathBuf, Release, Anime)],
    library: &LibraryService,
    episode_service: &EpisodeService,
) {
    println!("\nPlan:");
    println!("{:-<70}", "");

    for (file_path, release, anime) in files_to_import {
        #[allow(clippy::cast_possible_truncation)]
        let episode = release.episode_number as i32;
        let season = release.season.unwrap_or(1);

        let episode_title = episode_service
            .get_episode_title(anime.id, episode)
            .await
            .unwrap_or_else(|_| format!("Episode {episode}"));

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
}

async fn execute_import(
    files_to_import: &[(std::path::PathBuf, Release, Anime)],
    library: &LibraryService,
    episode_service: &EpisodeService,
    store: &Store,
) -> anyhow::Result<(usize, usize)> {
    let mut imported = 0;
    let mut failed = 0;

    for (file_path, release, anime) in files_to_import {
        #[allow(clippy::cast_possible_truncation)]
        let episode = release.episode_number as i32;
        let season = release.season.unwrap_or(1);

        let episode_title = episode_service
            .get_episode_title(anime.id, episode)
            .await
            .unwrap_or_else(|_| format!("Episode {episode}"));

        let height = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let quality = crate::quality::parse_quality_from_filename(&height).to_string();

        let media_service = crate::services::MediaService::new();
        let media_info = media_service.get_media_info(file_path).await.ok();

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

        match library.import_file(file_path, &dest).await {
            Ok(()) => {
                let file_size = tokio::fs::metadata(&dest)
                    .await
                    .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
                    .ok();
                let quality_id = crate::quality::determine_quality_id(release);

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

    Ok((imported, failed))
}

fn rebuild_map(m: &[Anime], map: &mut HashMap<String, Anime>) {
    map.clear();
    for anime in m {
        map.insert(anime.title.romaji.to_lowercase(), anime.clone());
        if let Some(ref en) = anime.title.english {
            map.insert(en.to_lowercase(), anime.clone());
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn resolve_anime_for_file(
    file_path: &Path,
    release: &Release,
    monitored: &mut Vec<Anime>,
    title_map: &mut HashMap<String, Anime>,
    searched_directories: &mut HashSet<String>,
    import_root: &Path,
    target_anime: Option<&Anime>,
    scanner_service: &crate::services::LibraryScannerService,
    anilist: &AnilistClient,
    store: &Store,
    config: &Config,
    dry_run: bool,
) -> anyhow::Result<Option<Anime>> {
    if let Some(a) = target_anime {
        return Ok(Some(a.clone()));
    }

    let (match_result, directory_title) =
        scanner_service.match_file_to_anime(file_path, release, title_map, Some(import_root));

    if let Some(matched) = match_result {
        return Ok(Some(matched));
    }

    let search_query = directory_title.as_ref().unwrap_or(&release.title);
    let search_key = search_query.to_lowercase();

    if searched_directories.contains(&search_key) {
        return Ok(None);
    }

    searched_directories.insert(search_key.clone());

    print!("  No local match for \"{search_query}\". Search AniList? [Y/n] ");
    std::io::stdout().flush()?;

    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;

    if !input.trim().is_empty() && !input.trim().eq_ignore_ascii_case("y") {
        return Ok(None);
    }

    let results = match anilist.search_anime(search_query).await {
        Ok(r) => r,
        Err(e) => {
            println!("    AniList search failed: {e}");
            return Ok(None);
        }
    };

    let Some(best) = results.first() else {
        println!("    No results found on AniList.");
        return Ok(None);
    };

    println!("    Found: {} ({})", best.title.romaji, best.id);
    print!("    Add to library and import? [Y/n] ");
    std::io::stdout().flush()?;

    let mut confirm = String::new();
    std::io::stdin().read_line(&mut confirm)?;

    if !confirm.trim().is_empty() && !confirm.trim().eq_ignore_ascii_case("y") {
        return Ok(None);
    }

    if dry_run {
        println!("    [Dry Run] Would add {} to library.", best.title.romaji);
        return Ok(Some(best.clone()));
    }

    let image_service = ImageService::new(config.clone());
    let mut anime_to_add = best.clone();

    if let Some(url) = &anime_to_add.cover_image {
        match image_service
            .save_image(url, anime_to_add.id, ImageType::Cover)
            .await
        {
            Ok(path) => {
                anime_to_add.cover_image = Some(path);
            }
            Err(e) => println!("Warning: Failed to download cover image: {e}"),
        }
    }

    if let Some(url) = &anime_to_add.banner_image {
        match image_service
            .save_image(url, anime_to_add.id, ImageType::Banner)
            .await
        {
            Ok(path) => {
                anime_to_add.banner_image = Some(path);
            }
            Err(e) => println!("Warning: Failed to download banner image: {e}"),
        }
    }

    store.add_anime(&anime_to_add).await?;
    println!("    Added {} to library.", anime_to_add.title.romaji);

    monitored.push(anime_to_add.clone());
    rebuild_map(monitored, title_map);

    Ok(Some(anime_to_add))
}
