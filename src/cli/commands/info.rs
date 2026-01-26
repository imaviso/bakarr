use crate::clients::jikan::JikanClient;
use crate::clients::nyaa::NyaaClient;
use crate::clients::offline_db::OfflineDatabase;
use crate::clients::seadex::SeaDexClient;
use crate::config::Config;
use crate::db::Store;
use crate::services::episodes::EpisodeService;
use tracing::warn;

pub async fn cmd_anime_info(
    config: &Config,
    id_str: &str,
    refresh_episodes: bool,
) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let id: i32 = if let Ok(id) = id_str.parse() {
        id
    } else {
        println!("Invalid anime ID: {id_str}");
        return Ok(());
    };

    let Some(anime) = store.get_anime(id).await? else {
        println!("Anime with ID {id} not found in monitored list.");
        return Ok(());
    };

    if refresh_episodes {
        println!("Refreshing episode metadata from Jikan...");
        let episode_service = EpisodeService::new(store.clone());
        match episode_service.refresh_episode_cache(id).await {
            Ok(count) => println!("✓ Refreshed metadata for {count} episodes\n"),
            Err(e) => println!("⚠ Failed to refresh: {e}\n"),
        }
    }

    println!("Anime Info");
    println!("{:-<60}", "");
    println!("Title:    {}", anime.title.romaji);
    if let Some(en) = &anime.title.english {
        println!("English:  {en}");
    }
    if let Some(native) = &anime.title.native {
        println!("Native:   {native}");
    }
    println!("ID:       {}", anime.id);
    println!("Format:   {}", anime.format);
    println!(
        "Episodes: {}",
        anime
            .episode_count
            .map_or_else(|| "?".to_string(), |e| e.to_string())
    );
    println!("Status:   {}", anime.status);

    display_external_mappings(id).await;

    let downloads = store.get_downloads_for_anime(id).await?;
    display_download_history(&downloads);

    if config.downloads.use_seadex {
        display_seadex_info(id).await;
    }

    display_nyaa_availability(&anime.title.romaji).await;

    println!();
    Ok(())
}

async fn display_external_mappings(id: i32) {
    let offline_db = match OfflineDatabase::load().await {
        Ok(db) => Some(db),
        Err(e) => {
            warn!("Failed to load offline database: {}", e);
            None
        }
    };

    if let Some(db) = offline_db
        && let Some(mapping) = db
            .get_by_anilist_id(id)
            .map(crate::clients::offline_db::AnimeEntry::get_id_mapping)
    {
        println!("Mappings: Anilist: {id}");
        if let Some(mal_id) = mapping.mal_id {
            print!(" | MAL: {mal_id}");
        }
        if let Some(ids) = mapping.kitsu_id {
            print!(" | Kitsu: {ids}");
        }
        println!();

        if let Some(mal_id) = mapping.mal_id {
            let jikan = JikanClient::new();
            match jikan.get_anime(mal_id).await {
                Ok(Some(mal_anime)) => {
                    println!();
                    println!("-- MyAnimeList Data --");
                    if let Some(score) = mal_anime.score {
                        println!("Score:    {score}/10");
                    }
                    if let Some(synopsis) = mal_anime.synopsis {
                        let display_synopsis = if synopsis.len() > 300 {
                            format!("{}...", &synopsis[0..300])
                        } else {
                            synopsis
                        };
                        println!("Synopsis: {display_synopsis}");
                    }
                    if let Some(rating) = mal_anime.rating {
                        println!("Rating:   {rating}");
                    }
                    if let Some(broadcast) = mal_anime.broadcast
                        && let Some(string) = broadcast.string
                    {
                        println!("Airing:   {string}");
                    }
                }
                Ok(None) => {}
                Err(e) => warn!("Failed to fetch Jikan data: {}", e),
            }
        }
    }
}

fn display_download_history(downloads: &[crate::db::repositories::download::DownloadEntry]) {
    println!();
    if downloads.is_empty() {
        println!("No episodes downloaded yet.");
    } else {
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
    }
}

async fn display_seadex_info(id: i32) {
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

async fn display_nyaa_availability(romaji_title: &str) {
    println!();
    print!("Available on Nyaa: ");
    let nyaa = NyaaClient::new();
    match nyaa.search_anime(romaji_title).await {
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
}
