use crate::clients::anilist::AnilistClient;
use crate::clients::seadex::SeaDexClient;
use crate::config::Config;
use crate::db::Store;
use crate::services::image::{ImageService, ImageType};

pub async fn cmd_add_anime(config: &Config, query: &str) -> anyhow::Result<()> {
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

    for (i, anime) in results.iter().enumerate().take(10) {
        let eps = anime
            .episode_count
            .map_or_else(|| "? eps".to_string(), |e| format!("{e} eps"));
        let status = &anime.status;
        let title_en = anime.title.english.as_deref().unwrap_or("");

        println!("[{}] {} ({})", i + 1, anime.title.romaji, eps);
        if !title_en.is_empty() && title_en != anime.title.romaji {
            println!("    EN: {title_en}");
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
        Ok(n) if (1..=results.len().min(10)).contains(&n) => n - 1,
        _ => {
            println!("Invalid selection.");
            return Ok(());
        }
    };

    let mut anime = results[index].clone();

    let image_service = ImageService::new(config.clone());

    if let Some(url) = &anime.cover_image {
        match image_service
            .save_image(url, anime.id, ImageType::Cover)
            .await
        {
            Ok(path) => anime.cover_image = Some(path),
            Err(e) => println!("Warning: Failed to download cover image: {e}"),
        }
    }

    if let Some(url) = &anime.banner_image {
        match image_service
            .save_image(url, anime.id, ImageType::Banner)
            .await
        {
            Ok(path) => anime.banner_image = Some(path),
            Err(e) => println!("Warning: Failed to download banner image: {e}"),
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
            .map_or_else(|| "?".to_string(), |e| e.to_string())
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
