//! Episodes command handler

use crate::config::Config;
use crate::db::Store;
use crate::services::episodes::EpisodeService;
use anyhow::Context;

pub async fn cmd_episodes(config: &Config, id_str: &str, refresh: bool) -> anyhow::Result<()> {
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
