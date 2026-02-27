use crate::config::Config;
use crate::db::Store;
use crate::domain::{AnimeId, EpisodeNumber};
use anyhow::Context;

pub async fn cmd_episodes(config: &Config, id_str: &str, refresh: bool) -> anyhow::Result<()> {
    let id: i32 = id_str.parse().context("Invalid anime ID")?;
    let store = Store::new(&config.general.database_path).await?;

    let anime = store
        .get_anime(id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Anime with ID {id} not found"))?;

    println!("Episodes for: {}", anime.title.romaji);
    println!("{:-<70}", "");

    let episode_service = super::build_episode_service(config, &store);

    if refresh {
        println!("Refreshing episode metadata (AniList -> Kitsu -> Jikan)...");
        match episode_service.refresh_metadata(AnimeId::new(id)).await {
            Ok(count) => println!("✓ Cached {count} episodes\n"),
            Err(e) => println!("⚠ Failed to refresh: {e}\n"),
        }
    } else if !store.has_cached_episodes(id).await? {
        println!("Fetching episode metadata (AniList -> Kitsu -> Jikan)...");
        match episode_service.refresh_metadata(AnimeId::new(id)).await {
            Ok(count) if count > 0 => println!("✓ Cached {count} episodes\n"),
            Ok(_) => println!("⚠ No episode metadata available\n"),
            Err(e) => println!("⚠ Failed to fetch: {e}\n"),
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

        match episode_service
            .get_episode(AnimeId::new(id), EpisodeNumber::from(ep_num))
            .await
        {
            Ok(meta) => {
                let title = meta.title.as_deref().unwrap_or("(No title)");
                let aired = meta.aired.as_deref().unwrap_or("");
                let aired_str = if aired.is_empty() {
                    String::new()
                } else {
                    format!(" - {aired}")
                };

                println!("{status_icon} Episode {ep_num}: {title}{aired_str}");
            }
            Err(_) => {
                println!("{status_icon} Episode {ep_num}");
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
