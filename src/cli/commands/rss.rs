use crate::clients::nyaa::NyaaClient;
use crate::config::Config;
use crate::db::Store;
use crate::services::RssService;

pub async fn cmd_rss_add(
    config: &Config,
    anime_id_str: &str,
    group: Option<&str>,
    resolution: Option<&str>,
) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let anime_id: i32 = if let Ok(id) = anime_id_str.parse() {
        id
    } else {
        println!("Invalid anime ID: {anime_id_str}");
        return Ok(());
    };

    let Some(anime) = store.get_anime(anime_id).await? else {
        println!("Anime with ID {anime_id} not found in monitored list.");
        println!("Add it first with: bakarr add \"<anime name>\"");
        return Ok(());
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

    println!("✓ Added RSS feed #{feed_id}");
    println!("  Name: {name}");
    println!("  URL: {url}");
    println!();
    println!("The scheduler will check this feed automatically.");
    println!("Or run 'bakarr rss check' to check now.");

    Ok(())
}

pub async fn cmd_rss_list(config: &Config, anime_id_filter: Option<&str>) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let feeds = if let Some(id_str) = anime_id_filter {
        let anime_id: i32 = if let Ok(id) = id_str.parse() {
            id
        } else {
            println!("Invalid anime ID: {id_str}");
            return Ok(());
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
            .map_or_else(|| format!("Unknown ({id})"), |a| a.title.romaji.clone())
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
        println!("  Last checked: {last_check}");
        println!();
    }

    println!("Legend: ✓ Enabled | ⏸ Paused");

    Ok(())
}

pub async fn cmd_rss_remove(config: &Config, feed_id_str: &str) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let feed_id: i64 = if let Ok(id) = feed_id_str.parse() {
        id
    } else {
        println!("Invalid feed ID: {feed_id_str}");
        return Ok(());
    };

    if let Some(feed) = store.get_rss_feed(feed_id).await? {
        let name = feed.name.as_deref().unwrap_or("Unnamed");
        println!("Remove RSS feed #{}: {}?", feed.id, name);
        println!("Enter 'y' to confirm:");

        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        if input.trim().eq_ignore_ascii_case("y") {
            if store.remove_rss_feed(feed_id).await? {
                println!("✓ Removed RSS feed #{feed_id}");
            } else {
                println!("Failed to remove feed.");
            }
        } else {
            println!("Cancelled.");
        }
    } else {
        println!("RSS feed #{feed_id} not found.");
    }

    Ok(())
}

pub async fn cmd_rss_check(config: &Config) -> anyhow::Result<()> {
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
        Some(std::sync::Arc::new(QBitClient::new(qcfg)?))
    } else {
        None
    };

    let download_decisions = crate::services::DownloadDecisionService::new(store.clone());

    let rss_service = crate::services::DefaultRssService::new(
        store,
        nyaa,
        qbit,
        download_decisions,
        event_bus,
    );

    let stats = rss_service
        .check_feeds(u64::from(config.scheduler.check_delay_seconds))
        .await?;

    println!();
    println!(
        "Check complete. {} new items found, {} queued.",
        stats.new_items, stats.queued
    );

    Ok(())
}
