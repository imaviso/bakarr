use crate::clients::anilist::AnilistClient;
use crate::config::Config;

pub async fn cmd_search_anime(_config: &Config, query: &str) -> anyhow::Result<()> {
    println!("Searching for: {query}");

    let anilist = AnilistClient::new();
    let results = anilist.search_anime(query).await?;

    if results.is_empty() {
        println!("No anime found matching '{query}'");
        return Ok(());
    }

    println!();
    println!("Search Results:");
    println!("{:-<60}", "");

    for anime in results.iter().take(10) {
        let eps = anime
            .episode_count
            .map_or_else(|| "? eps".to_string(), |e| format!("{e} eps"));
        let title_en = anime.title.english.as_deref().unwrap_or("");

        println!("• {} ({})", anime.title.romaji, eps);
        if !title_en.is_empty() && title_en != anime.title.romaji {
            println!("  EN: {title_en}");
        }
        println!(
            "  Status: {} | ID: {} | Format: {}",
            anime.status, anime.id, anime.format
        );
        println!();
    }

    println!("To add an anime: bakarr add \"{query}\"");

    Ok(())
}
