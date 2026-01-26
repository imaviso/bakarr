use crate::config::Config;
use crate::db::Store;

pub async fn cmd_history(config: &Config, limit: i32) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;
    let downloads = store.recent_downloads(limit).await?;

    if downloads.is_empty() {
        println!("No download history.");
        return Ok(());
    }

    println!("Recent Downloads (last {}):", downloads.len());
    println!("{:-<70}", "");

    let monitored = store.list_monitored().await?;
    let get_title = |id: i32| -> String {
        monitored
            .iter()
            .find(|a| a.id == id)
            .map_or_else(|| format!("Unknown (ID: {id})"), |a| a.title.romaji.clone())
    };

    for dl in downloads {
        let title = get_title(dl.anime_id);
        let group = dl.group_name.as_deref().unwrap_or("Unknown");
        println!("• {} - Episode {}", title, dl.episode_number);
        println!("  Group: {} | {}", group, dl.download_date);
    }

    Ok(())
}
