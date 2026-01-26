use anyhow::Result;
use std::path::{Path, PathBuf};
use tokio::fs;
use tracing::{debug, info, warn};

#[derive(Clone)]
pub struct RecycleBin {
    path: PathBuf,

    retention_days: u32,
}

impl RecycleBin {
    pub fn new(path: impl Into<PathBuf>, retention_days: u32) -> Self {
        Self {
            path: path.into(),
            retention_days,
        }
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub async fn ensure_exists(&self) -> Result<()> {
        fs::create_dir_all(&self.path).await?;
        Ok(())
    }

    pub async fn recycle(&self, file_path: &Path, reason: &str) -> Result<RecycledFile> {
        self.ensure_exists().await?;

        let filename = file_path
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("Invalid file path"))?;

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let recycled_name = format!("{}_{}", timestamp, filename.to_string_lossy());
        let recycled_path = self.path.join(&recycled_name);

        let file_size = fs::metadata(file_path)
            .await
            .ok()
            .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX));

        fs::rename(file_path, &recycled_path).await?;

        info!(
            "Recycled {:?} -> {:?} (reason: {})",
            file_path, recycled_path, reason
        );

        Ok(RecycledFile {
            original_path: file_path.to_path_buf(),
            recycled_path,
            file_size,
            reason: reason.to_string(),
        })
    }

    pub async fn restore(&self, recycled_path: &Path, original_path: &Path) -> Result<()> {
        if let Some(parent) = original_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        fs::rename(recycled_path, original_path).await?;
        info!("Restored {:?} -> {:?}", recycled_path, original_path);

        Ok(())
    }

    pub async fn cleanup(&self) -> Result<CleanupStats> {
        let mut stats = CleanupStats::default();

        if !self.path.exists() {
            return Ok(stats);
        }

        let cutoff = chrono::Utc::now() - chrono::Duration::days(i64::from(self.retention_days));
        let mut entries = fs::read_dir(&self.path).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();

            if !path.is_file() {
                continue;
            }

            if let Ok(metadata) = fs::metadata(&path).await
                && let Ok(modified) = metadata.modified()
            {
                let modified_time: chrono::DateTime<chrono::Utc> = modified.into();

                if modified_time < cutoff {
                    let size = metadata.len();

                    match fs::remove_file(&path).await {
                        Ok(()) => {
                            debug!("Cleaned up old file: {:?}", path);
                            stats.files_deleted += 1;
                            stats.bytes_freed += size;
                        }
                        Err(e) => {
                            warn!("Failed to delete {:?}: {}", path, e);
                            stats.errors += 1;
                        }
                    }
                }
            }
        }

        if stats.files_deleted > 0 {
            info!(
                "Recycle bin cleanup: deleted {} files, freed {} bytes",
                stats.files_deleted, stats.bytes_freed
            );
        }

        Ok(stats)
    }

    pub async fn get_size(&self) -> Result<u64> {
        let mut total = 0u64;

        if !self.path.exists() {
            return Ok(0);
        }

        let mut entries = fs::read_dir(&self.path).await?;
        while let Some(entry) = entries.next_entry().await? {
            if let Ok(metadata) = entry.metadata().await
                && metadata.is_file()
            {
                total += metadata.len();
            }
        }

        Ok(total)
    }

    pub async fn list(&self) -> Result<Vec<PathBuf>> {
        let mut files = Vec::new();

        if !self.path.exists() {
            return Ok(files);
        }

        let mut entries = fs::read_dir(&self.path).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() {
                files.push(path);
            }
        }

        files.sort();

        Ok(files)
    }

    pub async fn empty(&self) -> Result<CleanupStats> {
        let mut stats = CleanupStats::default();

        if !self.path.exists() {
            return Ok(stats);
        }

        let mut entries = fs::read_dir(&self.path).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();

            if path.is_file()
                && let Ok(metadata) = fs::metadata(&path).await
            {
                let size = metadata.len();

                match fs::remove_file(&path).await {
                    Ok(()) => {
                        stats.files_deleted += 1;
                        stats.bytes_freed += size;
                    }
                    Err(e) => {
                        warn!("Failed to delete {:?}: {}", path, e);
                        stats.errors += 1;
                    }
                }
            }
        }

        info!(
            "Emptied recycle bin: deleted {} files, freed {} bytes",
            stats.files_deleted, stats.bytes_freed
        );

        Ok(stats)
    }
}

#[derive(Debug, Clone)]
pub struct RecycledFile {
    pub original_path: PathBuf,
    pub recycled_path: PathBuf,
    pub file_size: Option<i64>,
    pub reason: String,
}

#[derive(Debug, Default)]
pub struct CleanupStats {
    pub files_deleted: usize,
    pub bytes_freed: u64,
    pub errors: usize,
}

impl CleanupStats {
    #[must_use]
    pub fn bytes_freed_human(&self) -> String {
        format_bytes(self.bytes_freed)
    }
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    #[allow(clippy::cast_precision_loss)]
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} bytes")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500 bytes");
        assert_eq!(format_bytes(1024), "1.00 KB");
        assert_eq!(format_bytes(1536), "1.50 KB");
        assert_eq!(format_bytes(1_048_576), "1.00 MB");
        assert_eq!(format_bytes(1_073_741_824), "1.00 GB");
    }
}
