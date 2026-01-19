pub mod api;
pub mod clients;
pub mod config;
pub mod db;
pub mod entities;
pub mod library;
pub mod models;
pub mod monitor;
pub mod parser;
pub mod quality;
pub mod scheduler;
pub mod services;

use std::sync::Arc;
use tokio::signal;
use tokio::sync::RwLock;

use anyhow::Context;
use clients::anilist::AnilistClient;
use clients::jikan::JikanClient;
use clients::nyaa::NyaaClient;
use clients::offline_db::OfflineDatabase;
use clients::seadex::SeaDexClient;
pub use config::Config;
use db::Store;
use library::RecycleBin;
use scheduler::{AppState, Scheduler};
use services::{DownloadDecisionService, EpisodeService};
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

pub async fn run() -> anyhow::Result<()> {
    let config = Config::load()?;
    config.validate()?;

    let prometheus_handle = if config.observability.metrics_enabled {
        use metrics_exporter_prometheus::PrometheusBuilder;
        let builder = PrometheusBuilder::new();
        let handle = builder
            .install_recorder()
            .context("Failed to install Prometheus recorder")?;
        info!("Prometheus metrics recorder initialized");
        Some(handle)
    } else {
        None
    };

    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

    let mut log_level = config.general.log_level.clone();
    if config.general.suppress_connection_errors {
        log_level.push_str(",reqwest::retry=off,hyper_util=off");
    }

    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&log_level));

    let fmt_layer = tracing_subscriber::fmt::layer();

    let registry = tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer);

    if config.observability.loki_enabled {
        let url = url::Url::parse(&config.observability.loki_url).context("Invalid Loki URL")?;

        let (layer, task) = tracing_loki::builder()
            .label("app", "bakarr")?
            .extra_field("env", "production")?
            .build_url(url)?;

        tokio::spawn(task);

        registry.with(layer).init();
        info!(
            "Loki logging initialized at {}",
            config.observability.loki_url
        );
    } else {
        registry.init();
    }

    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        print_help();
        return Ok(());
    }

    match args[1].as_str() {
        "daemon" | "-d" | "--daemon" => run_daemon(config, prometheus_handle).await,

        "check" | "-c" | "--check" => run_single_check(config).await,

        "add" | "a" => {
            if args.len() < 3 {
                println!("Usage: bakarr add <search query>");
                println!("Example: bakarr add \"Frieren\"");
                return Ok(());
            }
            let query = args[2..].join(" ");
            cmd_add_anime(&config, &query).await
        }

        "list" | "ls" | "l" => cmd_list_anime(&config).await,

        "remove" | "rm" | "r" => {
            if args.len() < 3 {
                println!("Usage: bakarr remove <anime_id or index>");
                println!("Use 'bakarr list' to see IDs");
                return Ok(());
            }
            let id_str = &args[2];
            cmd_remove_anime(&config, id_str).await
        }

        "search" | "s" => {
            if args.len() < 3 {
                println!("Usage: bakarr search <query>");
                return Ok(());
            }
            let query = args[2..].join(" ");
            cmd_search_anime(&config, &query).await
        }

        "info" | "i" => {
            if args.len() < 3 {
                println!("Usage: bakarr info <anime_id> [--refresh-episodes]");
                return Ok(());
            }
            let id_str = &args[2];
            let refresh_episodes = args.get(3).map(|s| s.as_str()) == Some("--refresh-episodes");
            cmd_anime_info(&config, id_str, refresh_episodes).await
        }

        "history" | "h" => {
            let limit = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(10);
            cmd_history(&config, limit).await
        }

        "rss" => {
            if args.len() < 3 {
                println!("Usage: bakarr rss <subcommand>");
                println!("Subcommands: add, list, remove, check");
                return Ok(());
            }
            match args[2].as_str() {
                "add" => {
                    if args.len() < 5 {
                        println!("Usage: bakarr rss add <anime_id> [group] [resolution]");
                        println!("Example: bakarr rss add 154587 SubsPlease 1080p");
                        return Ok(());
                    }
                    let anime_id = &args[3];
                    let group = args.get(4).map(|s| s.as_str());
                    let resolution = args.get(5).map(|s| s.as_str());
                    cmd_rss_add(&config, anime_id, group, resolution).await
                }
                "list" | "ls" => {
                    let anime_id = args.get(3).map(|s| s.as_str());
                    cmd_rss_list(&config, anime_id).await
                }
                "remove" | "rm" => {
                    if args.len() < 4 {
                        println!("Usage: bakarr rss remove <feed_id>");
                        return Ok(());
                    }
                    let feed_id = &args[3];
                    cmd_rss_remove(&config, feed_id).await
                }
                "check" => cmd_rss_check(&config).await,
                _ => {
                    println!("Unknown RSS subcommand: {}", args[2]);
                    println!("Use: add, list, remove, check");
                    Ok(())
                }
            }
        }

        "wanted" | "w" | "missing" => {
            let anime_id = args.get(2).and_then(|s| s.parse().ok());
            cmd_wanted(&config, anime_id).await
        }

        "scan" | "scan-library" => cmd_scan_library(&config).await,

        "import" => {
            if args.len() < 3 {
                println!("Usage: bakarr import <path> [--anime <id>] [--dry-run]");
                println!("Example: bakarr import ~/Downloads/Anime/");
                return Ok(());
            }
            let path = &args[2];
            let anime_id = args
                .iter()
                .position(|a| a == "--anime")
                .and_then(|i| args.get(i + 1))
                .and_then(|s| s.parse().ok());
            let dry_run = args.iter().any(|a| a == "--dry-run");
            cmd_import(&config, path, anime_id, dry_run).await
        }

        "search-missing" => cmd_search_missing(&config).await,

        "init" | "--init" => {
            Config::create_default_if_missing()?;
            println!("✓ Config file created. Edit config.toml and run again.");
            Ok(())
        }

        "profile" => {
            if args.len() < 3 {
                println!("Usage: bakarr profile <subcommand>");
                println!("Subcommands:");
                println!("  list                List all quality profiles");
                println!("  show <name>         Show details about a specific profile");
                println!("  create <name>       Create a new quality profile (interactive)");
                println!("  edit <name>         Edit an existing profile (interactive)");
                println!("  delete <name>       Delete a quality profile");
                return Ok(());
            }
            match args[2].as_str() {
                "list" | "ls" => cmd_profile_list(&config).await,
                "show" => {
                    if args.len() < 4 {
                        println!("Usage: bakarr profile show <name>");
                        return Ok(());
                    }
                    let name = &args[3];
                    cmd_profile_show(&config, name).await
                }
                "create" => {
                    if args.len() < 4 {
                        println!("Usage: bakarr profile create <name>");
                        return Ok(());
                    }
                    let name = &args[3];
                    cmd_profile_create(&config, name).await
                }
                "edit" => {
                    if args.len() < 4 {
                        println!("Usage: bakarr profile edit <name>");
                        return Ok(());
                    }
                    let name = &args[3];
                    cmd_profile_edit(&config, name).await
                }
                "delete" | "rm" => {
                    if args.len() < 4 {
                        println!("Usage: bakarr profile delete <name>");
                        return Ok(());
                    }
                    let name = &args[3];
                    cmd_profile_delete(&config, name).await
                }
                _ => {
                    println!("Unknown profile subcommand: {}", args[2]);
                    println!("Use: list, show, create, edit, delete");
                    Ok(())
                }
            }
        }

        "episodes" => {
            if args.len() < 3 {
                println!("Usage: bakarr episodes <anime_id>");
                println!("       bakarr episodes <anime_id> --refresh");
                return Ok(());
            }
            let id_str = &args[2];
            let refresh = args.get(3).map(|s| s.as_str()) == Some("--refresh");
            cmd_episodes(&config, id_str, refresh).await
        }

        "help" | "-h" | "--help" => {
            print_help();
            Ok(())
        }

        _ => {
            println!("Unknown command: {}", args[1]);
            println!();
            print_help();
            Ok(())
        }
    }
}

fn print_help() {
    println!("Bakarr - Anime Download Manager");
    println!("A Sonarr alternative specifically for anime");
    println!();
    println!("USAGE:");
    println!("  bakarr <COMMAND> [OPTIONS]");
    println!();
    println!("COMMANDS:");
    println!("  add <query>       Search and add anime to monitor");
    println!("  list, ls          List all monitored anime");
    println!("  remove, rm <id>   Remove anime from monitoring");
    println!("  search <query>    Search for anime without adding");
    println!("  info <id>         Show details about a monitored anime");
    println!("  history [n]       Show recent download history (default: 10)");
    println!("  wanted [id]       Show missing/wanted episodes");
    println!("  scan              Scan library and update episode status");
    println!("  import <path>     Import existing video files");
    println!("  search-missing    Search and download missing episodes");
    println!("  rss <subcommand>  Manage RSS feeds");
    println!("  profile <subcmd>  Manage quality profiles (list, show, create, edit, delete)");
    println!("  episodes <id> [--refresh]");
    println!("                    List episodes with titles and status");
    println!("  check             Run a single check for new episodes");
    println!("  daemon            Run as background daemon with scheduler");
    println!("  init              Create default config file");
    println!("  help              Show this help message");
    println!();
    println!("RSS SUBCOMMANDS:");
    println!("  rss add <id> [group] [res]   Add RSS feed for anime");
    println!("  rss list [anime_id]          List RSS feeds");
    println!("  rss remove <feed_id>         Remove an RSS feed");
    println!("  rss check                    Check all RSS feeds now");
    println!();
    println!("EXAMPLES:");
    println!("  bakarr add \"Frieren\"              # Search and add anime");
    println!("  bakarr list                       # Show monitored anime");
    println!("  bakarr info 1                     # Show details for anime with ID 1");
    println!("  bakarr info 1 --refresh-episodes  # Refresh episode data and show details");
    println!("  bakarr wanted                     # Show all missing episodes");
    println!("  bakarr wanted 154587              # Missing episodes for one anime");
    println!("  bakarr episodes 57                # List episodes with titles");
    println!("  bakarr episodes 57 --refresh      # Refresh episode data and list");
    println!("  bakarr scan                       # Scan library for existing files");
    println!("  bakarr import ~/Downloads/        # Import video files");
    println!("  bakarr search-missing             # Download missing episodes");
    println!("  bakarr rss add 154587 SubsPlease  # Add RSS with group filter");
    println!("  bakarr daemon                     # Start background service");
    println!();
    println!("CONFIG:");
    println!("  Edit config.toml to configure qBittorrent, scheduler, etc.");
}

async fn cmd_add_anime(config: &Config, query: &str) -> anyhow::Result<()> {
    println!("Searching for: {}", query);

    let anilist = AnilistClient::new();
    let results = anilist.search_anime(query).await?;

    if results.is_empty() {
        println!("No anime found matching '{}'", query);
        return Ok(());
    }

    println!();
    println!("Search Results:");
    println!("{:-<60}", "");

    for (i, anime) in results.iter().enumerate().take(10) {
        let eps = anime
            .episode_count
            .map(|e| format!("{} eps", e))
            .unwrap_or_else(|| "? eps".to_string());
        let status = &anime.status;
        let title_en = anime.title.english.as_deref().unwrap_or("");

        println!("[{}] {} ({})", i + 1, anime.title.romaji, eps);
        if !title_en.is_empty() && title_en != anime.title.romaji {
            println!("    EN: {}", title_en);
        }
        println!("    Status: {} | ID: {}", status, anime.id);
        println!();
    }

    println!(
        "Enter number to add (1-{}), or 'q' to cancel:",
        results.len().min(10)
    );

    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;
    let input = input.trim();

    if input.eq_ignore_ascii_case("q") || input.is_empty() {
        println!("Cancelled.");
        return Ok(());
    }

    let index: usize = match input.parse::<usize>() {
        Ok(n) if n >= 1 && n <= results.len().min(10) => n - 1,
        _ => {
            println!("Invalid selection.");
            return Ok(());
        }
    };

    let mut anime = results[index].clone();

    use crate::services::image::{ImageService, ImageType};
    let image_service = ImageService::new(config.clone());

    if let Some(url) = &anime.cover_image {
        match image_service
            .save_image(url, anime.id, ImageType::Cover)
            .await
        {
            Ok(path) => anime.cover_image = Some(path),
            Err(e) => println!("Warning: Failed to download cover image: {}", e),
        }
    }

    if let Some(url) = &anime.banner_image {
        match image_service
            .save_image(url, anime.id, ImageType::Banner)
            .await
        {
            Ok(path) => anime.banner_image = Some(path),
            Err(e) => println!("Warning: Failed to download banner image: {}", e),
        }
    }

    let store = Store::new(&config.general.database_path).await?;
    store.initialize_quality_system(config).await?;
    store.add_anime(&anime).await?;

    println!();
    println!("✓ Added: {} (ID: {})", anime.title.romaji, anime.id);
    println!(
        "  Episodes: {}",
        anime
            .episode_count
            .map(|e| e.to_string())
            .unwrap_or("?".to_string())
    );
    println!("  Status: {}", anime.status);

    if config.downloads.use_seadex {
        let seadex = SeaDexClient::new();
        if let Ok(releases) = seadex.get_best_for_anime(anime.id).await
            && !releases.is_empty()
        {
            println!();
            println!("  SeaDex recommended groups:");
            for r in releases.iter().take(3) {
                let dual = if r.dual_audio { " [DUAL]" } else { "" };
                println!("    - {}{}", r.release_group, dual);
            }
        }
    }

    println!();
    println!("Run 'bakarr check' to search for available episodes.");

    Ok(())
}

async fn cmd_list_anime(config: &Config) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;
    let anime_list = store.list_monitored().await?;

    if anime_list.is_empty() {
        println!("No anime being monitored.");
        println!();
        println!("Add anime with: bakarr add \"anime name\"");
        return Ok(());
    }

    println!("Monitored Anime ({} total)", anime_list.len());
    println!("{:-<70}", "");

    for anime in anime_list {
        let eps = anime
            .episode_count
            .map(|e| e.to_string())
            .unwrap_or("?".to_string());
        let downloaded = store.downloaded_episode_count(anime.id).await.unwrap_or(0);

        let progress = if anime.episode_count.is_some() {
            format!("{}/{}", downloaded, eps)
        } else {
            format!("{}/? eps", downloaded)
        };

        let status_indicator = match anime.status.as_str() {
            "RELEASING" => "🟢",
            "FINISHED" => "✓",
            "NOT_YET_RELEASED" => "📅",
            _ => "•",
        };

        println!("{} {} [{}]", status_indicator, anime.title.romaji, progress);
        println!(
            "  ID: {} | Format: {} | Status: {}",
            anime.id, anime.format, anime.status
        );
    }

    println!();
    println!("Legend: 🟢 Airing | ✓ Completed | 📅 Upcoming");

    Ok(())
}

async fn cmd_remove_anime(config: &Config, id_str: &str) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let id: i32 = match id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            println!("Invalid anime ID: {}", id_str);
            println!("Use 'bakarr list' to see anime IDs.");
            return Ok(());
        }
    };

    if let Some(anime) = store.get_anime(id).await? {
        println!(
            "Remove '{}' (ID: {}) from monitoring?",
            anime.title.romaji, anime.id
        );
        println!("Enter 'y' to confirm, anything else to cancel:");

        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        if input.trim().eq_ignore_ascii_case("y") {
            if store.remove_anime(id).await? {
                println!("✓ Removed: {}", anime.title.romaji);
            } else {
                println!("Failed to remove anime.");
            }
        } else {
            println!("Cancelled.");
        }
    } else {
        println!("Anime with ID {} not found in monitored list.", id);
    }

    Ok(())
}

async fn cmd_search_anime(_config: &Config, query: &str) -> anyhow::Result<()> {
    println!("Searching for: {}", query);

    let anilist = AnilistClient::new();
    let results = anilist.search_anime(query).await?;

    if results.is_empty() {
        println!("No anime found matching '{}'", query);
        return Ok(());
    }

    println!();
    println!("Search Results:");
    println!("{:-<60}", "");

    for anime in results.iter().take(10) {
        let eps = anime
            .episode_count
            .map(|e| format!("{} eps", e))
            .unwrap_or_else(|| "? eps".to_string());
        let title_en = anime.title.english.as_deref().unwrap_or("");

        println!("• {} ({})", anime.title.romaji, eps);
        if !title_en.is_empty() && title_en != anime.title.romaji {
            println!("  EN: {}", title_en);
        }
        println!(
            "  Status: {} | ID: {} | Format: {}",
            anime.status, anime.id, anime.format
        );
        println!();
    }

    println!("To add an anime: bakarr add \"{}\"", query);

    Ok(())
}

async fn cmd_anime_info(
    config: &Config,
    id_str: &str,
    refresh_episodes: bool,
) -> anyhow::Result<()> {
    use crate::services::episodes::EpisodeService;

    let store = Store::new(&config.general.database_path).await?;

    let id: i32 = match id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            println!("Invalid anime ID: {}", id_str);
            return Ok(());
        }
    };

    let anime = match store.get_anime(id).await? {
        Some(a) => a,
        None => {
            println!("Anime with ID {} not found in monitored list.", id);
            return Ok(());
        }
    };

    if refresh_episodes {
        println!("Refreshing episode metadata from Jikan...");
        let episode_service = EpisodeService::new(store.clone());
        match episode_service.refresh_episode_cache(id).await {
            Ok(count) => println!("✓ Refreshed metadata for {} episodes\n", count),
            Err(e) => println!("⚠ Failed to refresh: {}\n", e),
        }
    }

    println!("Anime Info");
    println!("{:-<60}", "");
    println!("Title:    {}", anime.title.romaji);
    if let Some(en) = &anime.title.english {
        println!("English:  {}", en);
    }
    if let Some(native) = &anime.title.native {
        println!("Native:   {}", native);
    }
    println!("ID:       {}", anime.id);
    println!("Format:   {}", anime.format);
    println!(
        "Episodes: {}",
        anime
            .episode_count
            .map(|e| e.to_string())
            .unwrap_or("?".to_string())
    );
    println!("Status:   {}", anime.status);

    let offline_db = match OfflineDatabase::load().await {
        Ok(db) => Some(db),
        Err(e) => {
            warn!("Failed to load offline database: {}", e);
            None
        }
    };

    if let Some(db) = offline_db
        && let Some(mapping) = db.get_by_anilist_id(id).map(|e| e.get_id_mapping())
    {
        println!("Mappings: Anilist: {}", id);
        if let Some(mal_id) = mapping.mal_id {
            print!(" | MAL: {}", mal_id);
        }
        if let Some(ids) = mapping.kitsu_id {
            print!(" | Kitsu: {}", ids);
        }
        println!();

        if let Some(mal_id) = mapping.mal_id {
            let jikan = JikanClient::new();
            match jikan.get_anime(mal_id).await {
                Ok(Some(mal_anime)) => {
                    println!();
                    println!("-- MyAnimeList Data --");
                    if let Some(score) = mal_anime.score {
                        println!("Score:    {}/10", score);
                    }
                    if let Some(synopsis) = mal_anime.synopsis {
                        let display_synopsis = if synopsis.len() > 300 {
                            format!("{}...", &synopsis[0..300])
                        } else {
                            synopsis
                        };
                        println!("Synopsis: {}", display_synopsis);
                    }
                    if let Some(rating) = mal_anime.rating {
                        println!("Rating:   {}", rating);
                    }
                    if let Some(broadcast) = mal_anime.broadcast
                        && let Some(string) = broadcast.string
                    {
                        println!("Airing:   {}", string);
                    }
                }
                Ok(None) => {}
                Err(e) => warn!("Failed to fetch Jikan data: {}", e),
            }
        }
    }

    let downloads = store.get_downloads_for_anime(id).await?;
    if !downloads.is_empty() {
        println!();
        println!("Downloaded Episodes ({}):", downloads.len());
        for dl in downloads.iter().take(10) {
            let group = dl.group_name.as_deref().unwrap_or("Unknown");
            println!(
                "  Ep {:>5} | {} | {}",
                dl.episode_number, group, dl.download_date
            );
        }
        if downloads.len() > 10 {
            println!("  ... and {} more", downloads.len() - 10);
        }
    } else {
        println!();
        println!("No episodes downloaded yet.");
    }

    if config.downloads.use_seadex {
        println!();
        print!("SeaDex recommendations: ");
        let seadex = SeaDexClient::new();
        match seadex.get_best_for_anime(id).await {
            Ok(releases) if !releases.is_empty() => {
                println!();
                for r in releases {
                    let dual = if r.dual_audio { " [DUAL]" } else { "" };
                    println!("  - {}{}", r.release_group, dual);
                }
            }
            Ok(_) => println!("None found"),
            Err(_) => println!("(lookup failed)"),
        }
    }

    println!();
    print!("Available on Nyaa: ");
    let nyaa = NyaaClient::new();
    match nyaa.search_anime(&anime.title.romaji).await {
        Ok(torrents) => {
            println!("{} torrents", torrents.len());
            if !torrents.is_empty() {
                println!("  Latest:");
                for t in torrents.iter().take(3) {
                    let trusted = if t.trusted { "[T]" } else { "" };
                    println!(
                        "    {} {} ({} seeds)",
                        trusted,
                        t.title.chars().take(50).collect::<String>(),
                        t.seeders
                    );
                }
            }
        }
        Err(_) => println!("(search failed)"),
    }

    Ok(())
}

async fn cmd_history(config: &Config, limit: i32) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;
    let downloads = store.recent_downloads(limit).await?;

    if downloads.is_empty() {
        println!("No download history.");
        return Ok(());
    }

    println!("Recent Downloads (last {}):", downloads.len());
    println!("{:-<70}", "");

    let monitored = store.list_monitored().await?;
    let get_title = |id: i32| -> String {
        monitored
            .iter()
            .find(|a| a.id == id)
            .map(|a| a.title.romaji.clone())
            .unwrap_or_else(|| format!("Unknown (ID: {})", id))
    };

    for dl in downloads {
        let title = get_title(dl.anime_id);
        let group = dl.group_name.as_deref().unwrap_or("Unknown");
        println!("• {} - Episode {}", title, dl.episode_number);
        println!("  Group: {} | {}", group, dl.download_date);
    }

    Ok(())
}

async fn cmd_profile_list(config: &Config) -> anyhow::Result<()> {
    println!("Quality Profiles:");
    println!("{:-<70}", "");

    for (i, profile) in config.profiles.iter().enumerate() {
        let is_default = i == 0;
        let default_marker = if is_default { " [DEFAULT]" } else { "" };

        println!("• {}{}", profile.name, default_marker);
        println!(
            "  Cutoff: {} | Upgrade: {} | SeaDex: {}",
            profile.cutoff,
            if profile.upgrade_allowed { "Yes" } else { "No" },
            if profile.seadex_preferred {
                "Yes"
            } else {
                "No"
            }
        );
        println!("  Allowed: {} qualities", profile.allowed_qualities.len());
    }

    println!();
    println!("Use 'bakarr profile show <name>' for details");
    Ok(())
}

async fn cmd_profile_show(config: &Config, name: &str) -> anyhow::Result<()> {
    let profile = config
        .find_profile(name)
        .ok_or_else(|| anyhow::anyhow!("Profile '{}' not found", name))?;

    println!("Profile: {}", profile.name);
    println!("{:-<70}", "");
    println!("Cutoff Quality: {}", profile.cutoff);
    println!(
        "Upgrade Allowed: {}",
        if profile.upgrade_allowed { "Yes" } else { "No" }
    );
    println!(
        "SeaDex Preferred: {}",
        if profile.seadex_preferred {
            "Yes"
        } else {
            "No"
        }
    );
    println!();
    println!("Allowed Qualities:");
    for (i, quality) in profile.allowed_qualities.iter().enumerate() {
        let cutoff_marker = if quality == &profile.cutoff {
            " ⚠ CUTOFF"
        } else {
            ""
        };
        println!("  {}. {}{}", i + 1, quality, cutoff_marker);
    }

    let store = Store::new(&config.general.database_path).await?;
    let anime_using = store.get_anime_using_profile(name).await?;

    if !anime_using.is_empty() {
        println!();
        println!("Anime using this profile ({}):", anime_using.len());
        for anime in anime_using.iter().take(10) {
            println!("  • {} (ID: {})", anime.romaji_title, anime.id);
        }
        if anime_using.len() > 10 {
            println!("  ... and {} more", anime_using.len() - 10);
        }
    }

    Ok(())
}

async fn cmd_profile_create(_config: &Config, name: &str) -> anyhow::Result<()> {
    println!("Creating profile: {}", name);
    println!("Interactive profile creation coming soon!");
    println!();
    println!("For now, edit config.toml directly:");
    println!("  [[profiles]]");
    println!("  name = \"{}\"", name);
    println!("  cutoff = \"BluRay 1080p\"");
    println!("  upgrade_allowed = true");
    println!("  seadex_preferred = true");
    println!("  allowed_qualities = [\"BluRay 1080p\", \"WEB 1080p\", ...]");
    Ok(())
}

async fn cmd_profile_edit(_config: &Config, name: &str) -> anyhow::Result<()> {
    println!("Editing profile: {}", name);
    println!("Interactive profile editing coming soon!");
    println!();
    println!("For now, edit config.toml directly");
    Ok(())
}

async fn cmd_profile_delete(_config: &Config, name: &str) -> anyhow::Result<()> {
    println!("Deleting profile: {}", name);
    println!("Profile deletion coming soon!");
    println!();
    println!("This will require reassigning anime to another profile.");
    Ok(())
}

async fn cmd_episodes(config: &Config, id_str: &str, refresh: bool) -> anyhow::Result<()> {
    use crate::services::episodes::EpisodeService;

    let id: i32 = id_str.parse().context("Invalid anime ID")?;
    let store = Store::new(&config.general.database_path).await?;

    let anime = store
        .get_anime(id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Anime with ID {} not found", id))?;

    println!("Episodes for: {}", anime.title.romaji);
    println!("{:-<70}", "");

    let episode_service = EpisodeService::new(store.clone());

    if refresh {
        println!("Refreshing episode metadata from Jikan...");
        match episode_service.refresh_episode_cache(id).await {
            Ok(count) => println!("✓ Cached {} episodes\n", count),
            Err(e) => println!("⚠ Failed to refresh: {}\n", e),
        }
    } else if !store.has_cached_episodes(id).await? {
        println!("Fetching episode metadata from Jikan...");
        match episode_service.fetch_and_cache_episodes(id).await {
            Ok(count) if count > 0 => println!("✓ Cached {} episodes\n", count),
            Ok(_) => println!("⚠ No episode metadata available\n"),
            Err(e) => println!("⚠ Failed to fetch: {}\n", e),
        }
    }

    let downloaded_eps = store.get_episode_statuses(id).await?;
    let downloaded_numbers: std::collections::HashSet<i32> = downloaded_eps
        .iter()
        .filter(|e| e.file_path.is_some())
        .map(|e| e.episode_number)
        .collect();

    let max_episode = anime.episode_count.unwrap_or(1);

    for ep_num in 1..=max_episode {
        let is_downloaded = downloaded_numbers.contains(&ep_num);
        let status_icon = if is_downloaded { "✓" } else { "○" };

        match episode_service.get_episode_metadata(id, ep_num).await? {
            Some(meta) => {
                let title = meta.title.as_deref().unwrap_or("(No title)");
                let aired = meta.aired.as_deref().unwrap_or("");
                let aired_str = if !aired.is_empty() {
                    format!(" - {}", aired)
                } else {
                    String::new()
                };

                println!("{} Episode {}: {}{}", status_icon, ep_num, title, aired_str);
            }
            None => {
                println!("{} Episode {}", status_icon, ep_num);
            }
        }
    }

    println!();
    println!("Legend: ✓ Downloaded | ○ Missing");
    println!();
    if !refresh {
        println!("Use '--refresh' flag to update episode metadata");
    }

    Ok(())
}

async fn run_daemon(
    config: Config,
    prometheus_handle: Option<metrics_exporter_prometheus::PrometheusHandle>,
) -> anyhow::Result<()> {
    info!(
        "Bakarr v{} starting in daemon mode...",
        env!("CARGO_PKG_VERSION")
    );

    let api_state = api::create_app_state(config.clone(), prometheus_handle).await?;

    let scheduler_state = Arc::new(RwLock::new(AppState {
        config: config.clone(),
        store: api_state.store.clone(),
        seadex: api_state.seadex.clone(),
        nyaa: api_state.nyaa.clone(),
        qbit: api_state.qbit.clone(),
        episodes: EpisodeService::new(api_state.store.clone()),
        download_decisions: DownloadDecisionService::new(api_state.store.clone()),
        search_service: api_state.search_service.clone(),
        recycle_bin: RecycleBin::new(
            &config.library.recycle_path,
            config.library.recycle_cleanup_days,
        ),
        event_bus: api_state.event_bus.clone(),
    }));

    let scheduler = Scheduler::new(Arc::clone(&scheduler_state), config.scheduler.clone());

    let scheduler_handle = {
        let sched = scheduler;
        tokio::spawn(async move {
            if let Err(e) = sched.start().await {
                error!("Scheduler error: {}", e);
            }
        })
    };

    let monitor = crate::monitor::Monitor::new(Arc::clone(&scheduler_state));
    let monitor_handle = tokio::spawn(async move {
        monitor.start().await;
    });

    let server_handle: Option<tokio::task::JoinHandle<()>> = if config.server.enabled {
        let port = config.server.port;
        info!("Starting Web API on port {}", port);

        let app = api::router(api_state);
        let addr = format!("0.0.0.0:{}", port);
        let listener = tokio::net::TcpListener::bind(&addr).await?;

        Some(tokio::spawn(async move {
            info!("🌐 Web Server running at http://0.0.0.0:{}", port);
            if let Err(e) = axum::serve(listener, app).await {
                error!("Web server error: {}", e);
            }
        }))
    } else {
        None
    };

    info!("Daemon running. Press Ctrl+C to stop.");

    match signal::ctrl_c().await {
        Ok(()) => {
            info!("Shutdown signal received");
        }
        Err(e) => {
            error!("Error listening for shutdown: {}", e);
        }
    }

    scheduler_handle.abort();
    monitor_handle.abort();
    if let Some(handle) = server_handle {
        handle.abort();
    }
    info!("Daemon stopped");

    Ok(())
}

async fn run_single_check(config: Config) -> anyhow::Result<()> {
    info!("Running single check...");

    let (event_bus, _) = tokio::sync::broadcast::channel(100);
    let state = Arc::new(RwLock::new(AppState::new(config.clone(), event_bus).await?));
    let scheduler = Scheduler::new(Arc::clone(&state), config.scheduler.clone());

    scheduler.run_once().await?;

    info!("Check complete");
    Ok(())
}

async fn cmd_rss_add(
    config: &Config,
    anime_id_str: &str,
    group: Option<&str>,
    resolution: Option<&str>,
) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let anime_id: i32 = match anime_id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            println!("Invalid anime ID: {}", anime_id_str);
            return Ok(());
        }
    };

    let anime = match store.get_anime(anime_id).await? {
        Some(a) => a,
        None => {
            println!("Anime with ID {} not found in monitored list.", anime_id);
            println!("Add it first with: bakarr add \"<anime name>\"");
            return Ok(());
        }
    };

    let url = NyaaClient::generate_rss_url(&anime.title.romaji, group, resolution);

    let name = if let Some(g) = group {
        if let Some(r) = resolution {
            format!("{} - {} {}", anime.title.romaji, g, r)
        } else {
            format!("{} - {}", anime.title.romaji, g)
        }
    } else if let Some(r) = resolution {
        format!("{} - {}", anime.title.romaji, r)
    } else {
        format!("{} - All", anime.title.romaji)
    };

    let feed_id = store.add_rss_feed(anime_id, &url, Some(&name)).await?;

    println!("✓ Added RSS feed #{}", feed_id);
    println!("  Name: {}", name);
    println!("  URL: {}", url);
    println!();
    println!("The scheduler will check this feed automatically.");
    println!("Or run 'bakarr rss check' to check now.");

    Ok(())
}

async fn cmd_rss_list(config: &Config, anime_id_filter: Option<&str>) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let feeds = if let Some(id_str) = anime_id_filter {
        let anime_id: i32 = match id_str.parse() {
            Ok(id) => id,
            Err(_) => {
                println!("Invalid anime ID: {}", id_str);
                return Ok(());
            }
        };
        store.get_rss_feeds_for_anime(anime_id).await?
    } else {
        store.get_enabled_rss_feeds().await?
    };

    if feeds.is_empty() {
        println!("No RSS feeds configured.");
        println!();
        println!("Add feeds with: bakarr rss add <anime_id> [group] [resolution]");
        return Ok(());
    }

    let monitored = store.list_monitored().await?;
    let get_title = |id: i32| -> String {
        monitored
            .iter()
            .find(|a| a.id == id)
            .map(|a| a.title.romaji.clone())
            .unwrap_or_else(|| format!("Unknown ({})", id))
    };

    println!("RSS Feeds ({} total)", feeds.len());
    println!("{:-<70}", "");

    for feed in feeds {
        let status = if feed.enabled { "✓" } else { "⏸" };
        let name = feed.name.as_deref().unwrap_or("Unnamed");
        let last_check = feed.last_checked.as_deref().unwrap_or("Never");
        let anime_title = get_title(feed.anime_id);

        println!("{} Feed #{}: {}", status, feed.id, name);
        println!("  Anime: {} (ID: {})", anime_title, feed.anime_id);
        println!("  URL: {}...", &feed.url[..feed.url.len().min(60)]);
        println!("  Last checked: {}", last_check);
        println!();
    }

    println!("Legend: ✓ Enabled | ⏸ Paused");

    Ok(())
}

async fn cmd_rss_remove(config: &Config, feed_id_str: &str) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let feed_id: i64 = match feed_id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            println!("Invalid feed ID: {}", feed_id_str);
            return Ok(());
        }
    };

    if let Some(feed) = store.get_rss_feed(feed_id).await? {
        let name = feed.name.as_deref().unwrap_or("Unnamed");
        println!("Remove RSS feed #{}: {}?", feed.id, name);
        println!("Enter 'y' to confirm:");

        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        if input.trim().eq_ignore_ascii_case("y") {
            if store.remove_rss_feed(feed_id).await? {
                println!("✓ Removed RSS feed #{}", feed_id);
            } else {
                println!("Failed to remove feed.");
            }
        } else {
            println!("Cancelled.");
        }
    } else {
        println!("RSS feed #{} not found.", feed_id);
    }

    Ok(())
}

async fn cmd_rss_check(config: &Config) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;
    let nyaa = std::sync::Arc::new(crate::clients::nyaa::NyaaClient::new());
    let (event_bus, _) = tokio::sync::broadcast::channel(100);

    let qbit = if config.qbittorrent.enabled {
        use crate::clients::qbittorrent::{QBitClient, QBitConfig};
        let qcfg = QBitConfig {
            base_url: config.qbittorrent.url.clone(),
            username: config.qbittorrent.username.clone(),
            password: config.qbittorrent.password.clone(),
        };
        Some(std::sync::Arc::new(QBitClient::new(qcfg)))
    } else {
        None
    };

    let rss_service = crate::services::RssService::new(store, nyaa, qbit, event_bus);

    let stats = rss_service.check_feeds().await?;

    println!();
    println!(
        "Check complete. {} new items found, {} queued.",
        stats.new_items, stats.queued
    );

    Ok(())
}

async fn cmd_wanted(config: &Config, anime_id: Option<i32>) -> anyhow::Result<()> {
    use crate::services::episodes::EpisodeService;

    let store = Store::new(&config.general.database_path).await?;
    let episode_service = EpisodeService::new(store.clone());

    let anime_list = if let Some(id) = anime_id {
        match store.get_anime(id).await? {
            Some(a) => vec![a],
            None => {
                println!("Anime with ID {} not found.", id);
                return Ok(());
            }
        }
    } else {
        store.list_monitored().await?
    };

    if anime_list.is_empty() {
        println!("No anime being monitored.");
        println!();
        println!("Add anime with: bakarr add \"anime name\"");
        return Ok(());
    }

    let mut total_missing = 0;
    let mut anime_with_missing = 0;

    println!("Wanted Episodes");
    println!("{:-<70}", "");

    for anime in &anime_list {
        let episode_count = match anime.episode_count {
            Some(c) => c,
            None => {
                println!("{} (ID: {})", anime.title.romaji, anime.id);
                println!("  Episode count: Unknown - cannot determine missing episodes");
                println!();
                continue;
            }
        };

        let downloaded = store.get_downloaded_count(anime.id).await.unwrap_or(0);
        let missing_count = episode_count - downloaded;

        if missing_count <= 0 {
            if anime_id.is_some() {
                println!("{} (ID: {})", anime.title.romaji, anime.id);
                println!("  All {} episodes downloaded!", episode_count);
                println!();
            }
            continue;
        }

        total_missing += missing_count;
        anime_with_missing += 1;

        let missing_eps = store.get_missing_episodes(anime.id, episode_count).await?;

        println!("{} (ID: {})", anime.title.romaji, anime.id);
        println!(
            "  Progress: {}/{} episodes | Missing: {}",
            downloaded, episode_count, missing_count
        );

        let status_str = match anime.status.as_str() {
            "RELEASING" => "Currently airing",
            "FINISHED" => "Finished airing",
            "NOT_YET_RELEASED" => "Not yet released",
            _ => &anime.status,
        };
        println!("  Status:   {}", status_str);

        println!("  Missing:");
        for (idx, &ep_num) in missing_eps.iter().take(10).enumerate() {
            let title = episode_service
                .get_episode_title(anime.id, ep_num)
                .await
                .unwrap_or_else(|_| format!("Episode {}", ep_num));

            println!("    {}. {}", idx + 1, title);
        }

        if missing_eps.len() > 10 {
            let remaining = missing_eps.len() - 10;
            println!("    ... and {} more episodes", remaining);
        }
        println!();
    }

    println!("{:-<70}", "");
    if total_missing > 0 {
        println!(
            "Total: {} missing episodes across {} anime",
            total_missing, anime_with_missing
        );
        println!();
        println!("Run 'bakarr search-missing' to search and download missing episodes.");
    } else if anime_id.is_none() {
        println!("All monitored anime have complete episodes!");
    }

    Ok(())
}

async fn cmd_scan_library(config: &Config) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;
    let (event_bus, _) = tokio::sync::broadcast::channel(100);

    let library_scanner = crate::services::LibraryScannerService::new(
        store,
        std::sync::Arc::new(RwLock::new(config.clone())),
        event_bus,
    );

    let stats = library_scanner.scan_library_files().await?;

    println!();
    println!("{:-<70}", "");
    println!("Scan complete!");
    println!("  Scanned: {}", stats.scanned);
    println!("  Matched: {}", stats.matched);
    println!("  Updated: {}", stats.updated);

    Ok(())
}

pub fn determine_quality_id(release: &crate::models::release::Release) -> i32 {
    let resolution = release
        .resolution
        .as_ref()
        .map(|r| {
            r.to_lowercase()
                .replace("p", "")
                .parse::<u16>()
                .unwrap_or(0)
        })
        .unwrap_or(0);

    let source = release.source.as_ref().map(|s| s.to_uppercase());
    let is_bluray = source
        .as_ref()
        .map(|s| s.contains("BD") || s.contains("BLURAY"))
        .unwrap_or(false);
    let is_web = source.as_ref().map(|s| s.contains("WEB")).unwrap_or(false);

    match (resolution, is_bluray, is_web) {
        (2160, true, _) => 1,
        (2160, _, true) => 2,
        (2160, _, _) => 2,
        (1080, true, _) => 3,
        (1080, _, true) => 4,
        (1080, _, _) => 4,
        (720, true, _) => 5,
        (720, _, true) => 6,
        (720, _, _) => 6,
        (576, _, _) => 9,
        (480, _, _) => 10,
        _ => 99,
    }
}

async fn cmd_import(
    config: &Config,
    path: &str,
    anime_id: Option<i32>,
    dry_run: bool,
) -> anyhow::Result<()> {
    use crate::clients::anilist::AnilistClient;
    use crate::library::LibraryService;
    use crate::parser::filename::parse_filename;
    use std::io::Write;
    use std::path::Path;

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
        std::sync::Arc::new(tokio::sync::RwLock::new(config.clone())),
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

    let video_extensions = ["mkv", "mp4", "avi", "webm", "m4v"];
    let mut files_to_import: Vec<(
        std::path::PathBuf,
        crate::models::release::Release,
        crate::models::anime::Anime,
    )> = Vec::new();

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
    let mut title_map: std::collections::HashMap<String, crate::models::anime::Anime> =
        std::collections::HashMap::new();

    let rebuild_map =
        |m: &[crate::models::anime::Anime],
         map: &mut std::collections::HashMap<String, crate::models::anime::Anime>| {
            map.clear();
            for anime in m {
                map.insert(anime.title.romaji.to_lowercase(), anime.clone());
                if let Some(ref en) = anime.title.english {
                    map.insert(en.to_lowercase(), anime.clone());
                }
            }
        };

    rebuild_map(&monitored, &mut title_map);

    let mut searched_directories: std::collections::HashSet<String> =
        std::collections::HashSet::new();

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
                                            use crate::services::image::{ImageService, ImageType};
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

    use crate::services::episodes::EpisodeService;
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
                let quality_id = determine_quality_id(&release);

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

async fn cmd_search_missing(config: &Config) -> anyhow::Result<()> {
    use crate::scheduler::AppState;

    let store = Store::new(&config.general.database_path).await?;
    let monitored = store.list_monitored().await?;

    if monitored.is_empty() {
        println!("No anime being monitored.");
        return Ok(());
    }

    println!("Searching for missing episodes...");
    println!();

    let nyaa = NyaaClient::new();
    let mut total_found = 0;
    let mut total_queued = 0;

    let (event_bus, _) = tokio::sync::broadcast::channel(100);
    let state = AppState::new(config.clone(), event_bus).await?;

    for anime in &monitored {
        let episode_count = match anime.episode_count {
            Some(c) => c,
            None => continue,
        };

        let missing = store.get_missing_episodes(anime.id, episode_count).await?;

        if missing.is_empty() {
            continue;
        }

        println!(
            "{} - {} missing episodes",
            anime.title.romaji,
            missing.len()
        );

        for episode in &missing {
            let query = format!("{} {:02}", anime.title.romaji, episode);

            match nyaa.search_anime(&query).await {
                Ok(torrents) => {
                    if torrents.is_empty() {
                        println!("  Episode {}: No results", episode);
                        continue;
                    }

                    total_found += 1;

                    let best = torrents.iter().filter(|t| t.seeders > 0).max_by_key(|t| {
                        let mut score = t.seeders as i32;
                        if t.title.contains("1080p") {
                            score += 1000;
                        }
                        if t.title.contains("720p") {
                            score += 500;
                        }
                        if t.trusted {
                            score += 100;
                        }
                        score
                    });

                    if let Some(torrent) = best {
                        println!(
                            "  Episode {}: Found - {} ({} seeds)",
                            episode,
                            torrent.title.chars().take(50).collect::<String>(),
                            torrent.seeders
                        );

                        if let Some(ref qbit) = state.qbit {
                            let magnet = torrent.magnet_link();
                            let options = crate::clients::qbittorrent::AddTorrentOptions {
                                category: Some(config.qbittorrent.default_category.clone()),
                                ..Default::default()
                            };

                            match qbit.add_torrent_url(&magnet, Some(options)).await {
                                Ok(_) => {
                                    total_queued += 1;

                                    store
                                        .record_download(
                                            anime.id,
                                            &torrent.title,
                                            *episode as f32,
                                            None,
                                            Some(&torrent.info_hash),
                                        )
                                        .await?;
                                }
                                Err(e) => {
                                    println!("    Failed to queue: {}", e);
                                }
                            }
                        }
                    } else {
                        println!(
                            "  Episode {}: No suitable torrent (all have 0 seeds)",
                            episode
                        );
                    }
                }
                Err(e) => {
                    println!("  Episode {}: Search failed - {}", episode, e);
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
        println!();
    }

    println!("{:-<70}", "");
    println!("Search complete!");
    println!("  Episodes found:  {}", total_found);
    if config.qbittorrent.enabled {
        println!("  Downloads queued: {}", total_queued);
    } else {
        println!("  qBittorrent disabled - no downloads queued");
        println!("  Enable qBittorrent in config.toml to auto-download");
    }

    Ok(())
}
