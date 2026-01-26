use crate::clients::nyaa::NyaaClient;
use crate::config::Config;
use crate::db::Store;
use crate::state::SharedState;

pub async fn cmd_search_missing(config: &Config) -> anyhow::Result<()> {
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

    let state = SharedState::new(config.clone()).await?;

    for anime in &monitored {
        let Some(episode_count) = anime.episode_count else {
            continue;
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
            let (found, queued) =
                search_and_queue_episode(anime, *episode, &nyaa, &state, &store, config).await?;

            if found {
                total_found += 1;
            }
            if queued {
                total_queued += 1;
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
        println!();
    }

    println!("{:-<70}", "");
    println!("Search complete!");
    println!("  Episodes found:  {total_found}");
    if config.qbittorrent.enabled {
        println!("  Downloads queued: {total_queued}");
    } else {
        println!("  qBittorrent disabled - no downloads queued");
        println!("  Enable qBittorrent in config.toml to auto-download");
    }

    Ok(())
}

async fn search_and_queue_episode(
    anime: &crate::models::anime::Anime,
    episode: i32,
    nyaa: &NyaaClient,
    state: &SharedState,
    store: &Store,
    config: &Config,
) -> anyhow::Result<(bool, bool)> {
    let query = format!("{} {:02}", anime.title.romaji, episode);
    let mut found = false;
    let mut queued = false;

    match nyaa.search_anime(&query).await {
        Ok(torrents) => {
            if torrents.is_empty() {
                println!("  Episode {episode}: No results");
                return Ok((false, false));
            }

            found = true;

            let best = torrents.iter().filter(|t| t.seeders > 0).max_by_key(|t| {
                let mut current_score = i32::try_from(t.seeders).unwrap_or(i32::MAX);
                if t.title.contains("1080p") {
                    current_score += 1000;
                }
                if t.title.contains("720p") {
                    current_score += 500;
                }
                if t.trusted {
                    current_score += 100;
                }
                current_score
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
                        Ok(()) => {
                            queued = true;

                            #[allow(clippy::cast_precision_loss)]
                            store
                                .record_download(
                                    anime.id,
                                    &torrent.title,
                                    episode as f32,
                                    None,
                                    Some(&torrent.info_hash),
                                )
                                .await?;
                        }
                        Err(e) => {
                            println!("    Failed to queue: {e}");
                        }
                    }
                }
            } else {
                println!("  Episode {episode}: No suitable torrent (all have 0 seeds)");
            }
        }
        Err(e) => {
            println!("  Episode {episode}: Search failed - {e}");
        }
    }

    Ok((found, queued))
}
