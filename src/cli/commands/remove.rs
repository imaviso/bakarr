use crate::config::Config;
use crate::db::Store;

pub async fn cmd_remove_anime(config: &Config, id_str: &str) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;

    let Ok(id) = id_str.parse::<i32>() else {
        println!("Invalid anime ID: {id_str}");
        println!("Use 'bakarr list' to see anime IDs.");
        return Ok(());
    };

    if let Some(anime) = store.get_anime(id).await? {
        println!(
            "Remove '{}' (ID: {}) from monitoring?",
            anime.title.romaji, anime.id
        );
        println!("Enter 'y' to confirm, anything else to cancel:");

        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        if input.trim().eq_ignore_ascii_case("y") {
            if store.remove_anime(id).await? {
                println!("✓ Removed: {}", anime.title.romaji);
            } else {
                println!("Failed to remove anime.");
            }
        } else {
            println!("Cancelled.");
        }
    } else {
        println!("Anime with ID {id} not found in monitored list.");
    }

    Ok(())
}
