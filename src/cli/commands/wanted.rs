use crate::clients::anilist::AnilistClient;
use crate::clients::jikan::JikanClient;
use crate::config::Config;
use crate::db::Store;
use crate::services::episodes::EpisodeService;
use std::sync::Arc;

pub async fn cmd_wanted(config: &Config, anime_id: Option<i32>) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;
    let jikan = Arc::new(JikanClient::new());
    let anilist = Arc::new(AnilistClient::new());
    let episode_service = EpisodeService::new(store.clone(), jikan, anilist, None);

    let anime_list = if let Some(id) = anime_id {
        if let Some(a) = store.get_anime(id).await? {
            vec![a]
        } else {
            println!("Anime with ID {id} not found.");
            return Ok(());
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
        let Some(episode_count) = anime.episode_count else {
            println!("{} (ID: {})", anime.title.romaji, anime.id);
            println!("  Episode count: Unknown - cannot determine missing episodes");
            println!();
            continue;
        };

        let downloaded = store.get_downloaded_count(anime.id).await.unwrap_or(0);
        let missing_count = episode_count - downloaded;

        if missing_count <= 0 {
            if anime_id.is_some() {
                println!("{} (ID: {})", anime.title.romaji, anime.id);
                println!("  All {episode_count} episodes downloaded!");
                println!();
            }
            continue;
        }

        total_missing += missing_count;
        anime_with_missing += 1;

        let missing_eps = store.get_missing_episodes(anime.id, episode_count).await?;

        println!("{} (ID: {})", anime.title.romaji, anime.id);
        println!("  Progress: {downloaded}/{episode_count} episodes | Missing: {missing_count}");

        let status_str = match anime.status.as_str() {
            "RELEASING" => "Currently airing",
            "FINISHED" => "Finished airing",
            "NOT_YET_RELEASED" => "Not yet released",
            _ => &anime.status,
        };
        println!("  Status:   {status_str}");

        println!("  Missing:");
        for (idx, &ep_num) in missing_eps.iter().take(10).enumerate() {
            let title = episode_service
                .get_episode_title(anime.id, ep_num)
                .await
                .unwrap_or_else(|_| format!("Episode {ep_num}"));

            println!("    {}. {title}", idx + 1);
        }

        if missing_eps.len() > 10 {
            let remaining = missing_eps.len() - 10;
            println!("    ... and {remaining} more episodes");
        }
        println!();
    }

    println!("{:-<70}", "");
    if total_missing > 0 {
        println!("Total: {total_missing} missing episodes across {anime_with_missing} anime");
        println!();
        println!("Run 'bakarr search-missing' to search and download missing episodes.");
    } else if anime_id.is_none() {
        println!("All monitored anime have complete episodes!");
    }

    Ok(())
}
