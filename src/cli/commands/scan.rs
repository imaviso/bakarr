use crate::config::Config;
use crate::db::Store;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn cmd_scan_library(config: &Config) -> anyhow::Result<()> {
    let store = Store::new(&config.general.database_path).await?;
    let (event_bus, _) = tokio::sync::broadcast::channel(100);

    let library_scanner = crate::services::LibraryScannerService::new(
        store,
        Arc::new(RwLock::new(config.clone())),
        event_bus,
    );

    let stats = library_scanner.scan_library_files().await?;

    println!();
    println!("{:-<70}", "");
    println!("Scan complete!");
    println!("  Scanned: {}", stats.scanned);
    println!("  Matched: {}", stats.matched);
    println!("  Updated: {}", stats.updated);

    Ok(())
}
