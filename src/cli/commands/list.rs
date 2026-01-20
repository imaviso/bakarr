//! List anime command handler

use crate::config::Config;
use crate::db::Store;

pub async fn cmd_list_anime(config: &Config) -> anyhow::Result<()> {
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
