//! Search missing episodes command handler

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
