use crate::config::Config;
use crate::db::Store;

pub async fn cmd_profile_list(config: &Config) -> anyhow::Result<()> {
    println!("Quality Profiles:");
    println!("{:-<70}", "");

    for (i, profile) in config.profiles.iter().enumerate() {
        let is_default = i == 0;
        let default_marker = if is_default { " [DEFAULT]" } else { "" };

        println!("• {}{}", profile.name, default_marker);
        println!(
            "  Cutoff: {} | Upgrade: {} | SeaDex: {}",
            profile.cutoff,
            if profile.upgrade_allowed { "Yes" } else { "No" },
            if profile.seadex_preferred {
                "Yes"
            } else {
                "No"
            }
        );
        println!("  Allowed: {} qualities", profile.allowed_qualities.len());
    }

    println!();
    println!("Use 'bakarr profile show <name>' for details");
    Ok(())
}

pub async fn cmd_profile_show(config: &Config, name: &str) -> anyhow::Result<()> {
    let profile = config
        .find_profile(name)
        .ok_or_else(|| anyhow::anyhow!("Profile '{name}' not found"))?;

    println!("Profile: {}", profile.name);
    println!("{:-<70}", "");
    println!("Cutoff Quality: {}", profile.cutoff);
    println!(
        "Upgrade Allowed: {}",
        if profile.upgrade_allowed { "Yes" } else { "No" }
    );
    println!(
        "SeaDex Preferred: {}",
        if profile.seadex_preferred {
            "Yes"
        } else {
            "No"
        }
    );
    println!();
    println!("Allowed Qualities:");
    for (i, quality) in profile.allowed_qualities.iter().enumerate() {
        let cutoff_marker = if quality == &profile.cutoff {
            " ⚠ CUTOFF"
        } else {
            ""
        };
        println!("  {}. {}{}", i + 1, quality, cutoff_marker);
    }

    let store = Store::new(&config.general.database_path).await?;
    let anime_using = store.get_anime_using_profile(name).await?;

    if !anime_using.is_empty() {
        println!();
        println!("Anime using this profile ({}):", anime_using.len());
        for anime in anime_using.iter().take(10) {
            println!("  • {} (ID: {})", anime.title.romaji, anime.id);
        }
        if anime_using.len() > 10 {
            println!("  ... and {} more", anime_using.len() - 10);
        }
    }

    Ok(())
}

pub async fn cmd_profile_create(_config: &Config, name: &str) -> anyhow::Result<()> {
    println!("Creating profile: {name}");
    println!("Interactive profile creation coming soon!");
    println!();
    println!("For now, edit config.toml directly:");
    println!("  [[profiles]]");
    println!("  name = \"{name}\"");
    println!("  cutoff = \"BluRay 1080p\"");
    println!("  upgrade_allowed = true");
    println!("  seadex_preferred = true");
    println!("  allowed_qualities = [\"BluRay 1080p\", \"WEB 1080p\", ...]");
    Ok(())
}

pub async fn cmd_profile_edit(_config: &Config, name: &str) -> anyhow::Result<()> {
    println!("Editing profile: {name}");
    println!("Interactive profile editing coming soon!");
    println!();
    println!("For now, edit config.toml directly");
    Ok(())
}

pub async fn cmd_profile_delete(_config: &Config, name: &str) -> anyhow::Result<()> {
    println!("Deleting profile: {name}");
    println!("Profile deletion coming soon!");
    println!();
    println!("This will require reassigning anime to another profile.");
    Ok(())
}
