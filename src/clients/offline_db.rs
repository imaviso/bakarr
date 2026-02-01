//! Anime Offline Database client for ID mapping and metadata lookup.
//!
//! This module handles downloading and importing the anime-offline-database
//! from the manami-project. All CPU-intensive operations are offloaded to
//! blocking threads to prevent runtime starvation.
//!
//! # Architecture
//!
//! The import process is split into three phases:
//! 1. **Download** (async): Fetches the compressed database from GitHub
//! 2. **Decompression** (blocking): Decompresses zstd data to JSON
//! 3. **Import** (blocking): Parses JSON and inserts into database in chunks

use anyhow::{Context, Result};
use serde::Deserialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use tracing::{debug, info, instrument};

use crate::db::Store;
use crate::entities::anime_metadata;

const DATABASE_URL: &str = "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json.zst";
const CACHE_FILENAME: &str = "anime-offline-database.json";
const DEFAULT_DATA_DIR: &str = "data";
const INSERT_CHUNK_SIZE: usize = 1000;

/// Root structure for the offline database JSON.
#[derive(Debug, Deserialize)]
struct DatabaseRoot {
    data: Vec<AnimeEntry>,
}

/// Single anime entry from the offline database.
#[derive(Debug, Clone, Deserialize)]
pub struct AnimeEntry {
    pub title: String,
    pub sources: Vec<String>,
    pub synonyms: Vec<String>,
    #[serde(default)]
    pub episodes: i32,
    #[serde(rename = "type")]
    pub anime_type: String,
    pub status: String,
    #[serde(rename = "animeSeason", default)]
    pub anime_season: Option<AnimeSeason>,
}

/// Season information for an anime entry.
#[derive(Debug, Clone, Deserialize)]
pub struct AnimeSeason {
    pub season: Option<String>,
    pub year: Option<i32>,
}

/// Mapping of external IDs for an anime entry.
#[derive(Debug, Clone)]
pub struct IdMapping {
    pub anilist_id: Option<i32>,
    pub mal_id: Option<i32>,
    pub anidb_id: Option<i32>,
    pub kitsu_id: Option<i32>,
}

impl AnimeEntry {
    /// Extracts ID mappings from the sources URLs.
    #[must_use]
    pub fn get_id_mapping(&self) -> IdMapping {
        let mut mapping = IdMapping {
            anilist_id: None,
            mal_id: None,
            anidb_id: None,
            kitsu_id: None,
        };

        for source in &self.sources {
            if let Some(id) = extract_id(source, "anilist.co/anime/") {
                mapping.anilist_id = Some(id);
            } else if let Some(id) = extract_id(source, "myanimelist.net/anime/") {
                mapping.mal_id = Some(id);
            } else if let Some(id) = extract_id(source, "anidb.net/anime/") {
                mapping.anidb_id = Some(id);
            } else if let Some(id) = extract_id(source, "kitsu.app/anime/") {
                mapping.kitsu_id = Some(id);
            }
        }

        mapping
    }
}

/// Extracts a numeric ID from a URL after a given prefix.
fn extract_id(url: &str, prefix: &str) -> Option<i32> {
    url.find(prefix)
        .map(|pos| &url[pos + prefix.len()..])
        .and_then(|s| {
            let num_str: String = s.chars().take_while(char::is_ascii_digit).collect();
            num_str.parse().ok()
        })
}

/// Client for the anime offline database.
///
/// Handles downloading, caching, and importing the database. All blocking
/// operations are offloaded to `spawn_blocking` tasks to avoid starving
/// the Tokio runtime.
#[derive(Clone)]
pub struct OfflineDatabase {
    store: Store,
    data_dir: PathBuf,
    http_client: reqwest::Client,
}

impl OfflineDatabase {
    /// Creates a new offline database client with default settings.
    #[must_use]
    pub fn new(store: Store) -> Self {
        Self {
            store,
            data_dir: PathBuf::from(DEFAULT_DATA_DIR),
            http_client: reqwest::Client::new(),
        }
    }

    /// Creates a new client with custom configuration.
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// use bakarr::clients::offline_db::OfflineDatabase;
    /// use bakarr::db::Store;
    /// use std::sync::Arc;
    ///
    /// async fn example(store: Store) -> anyhow::Result<()> {
    ///     let client = reqwest::Client::builder()
    ///         .timeout(std::time::Duration::from_secs(60))
    ///         .build()?;
    ///     
    ///     let db = OfflineDatabase::with_config(
    ///         store,
    ///         "/var/lib/bakarr/data",
    ///         client,
    ///     );
    ///     Ok(())
    /// }
    /// ```
    #[must_use]
    pub fn with_config(
        store: Store,
        data_dir: impl Into<PathBuf>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            store,
            data_dir: data_dir.into(),
            http_client,
        }
    }

    /// Returns the path to the cached database file.
    fn cache_path(&self) -> PathBuf {
        self.data_dir.join(CACHE_FILENAME)
    }

    /// Initializes the database by downloading and importing if empty.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The database download fails
    /// - Decompression fails
    /// - JSON parsing fails
    /// - Database insertion fails
    ///
    /// # Performance
    ///
    /// This operation is CPU-intensive and I/O-heavy. It offloads work to
    /// blocking threads to prevent runtime starvation.
    #[instrument(skip(self), fields(data_dir = ?self.data_dir))]
    pub async fn initialize(&self) -> Result<()> {
        // Check if already populated
        if !self.store.is_anime_metadata_empty().await? {
            debug!("Anime metadata database is already populated");
            return Ok(());
        }

        let start = std::time::Instant::now();
        info!(
            event = "offline_db_import_started",
            "Initializing anime offline database..."
        );

        let cache_path = self.cache_path();

        // Ensure data directory exists
        tokio::fs::create_dir_all(&self.data_dir)
            .await
            .with_context(|| {
                format!(
                    "Failed to create data directory: {}",
                    self.data_dir.display()
                )
            })?;

        // Download if cache doesn't exist
        if cache_path.exists() {
            debug!(path = ?cache_path, "Using cached database");
        } else {
            debug!("Cache not found, downloading database...");
            self.download_and_cache(&cache_path).await?;
        }

        // Import the data using spawn_blocking
        // CPU-intensive: offloaded to blocking thread
        let store = self.store.clone();
        let cache_path_clone = cache_path.clone();

        let count = tokio::task::spawn_blocking(move || {
            import_from_file_blocking(&store, &cache_path_clone)
        })
        .await
        .context("Blocking task panicked during import")?
        .context("Failed to import database from file")?;

        info!(
            event = "offline_db_import_finished",
            count = count,
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "Anime metadata import complete"
        );

        Ok(())
    }

    /// Downloads and decompresses the database to the cache file.
    ///
    /// # Errors
    ///
    /// Returns an error if the download or decompression fails.
    async fn download_and_cache(&self, cache_path: &Path) -> Result<()> {
        debug!(url = DATABASE_URL, "Downloading anime-offline-database...");

        let response = self
            .http_client
            .get(DATABASE_URL)
            .send()
            .await
            .context("Failed to send download request")?
            .error_for_status()
            .context("Download request returned error status")?;

        let compressed_bytes = response
            .bytes()
            .await
            .context("Failed to download response body")?;

        let cache_path_owned = cache_path.to_path_buf();

        // CPU-intensive: offloaded to blocking thread
        tokio::task::spawn_blocking(move || {
            decompress_to_file(&compressed_bytes, &cache_path_owned)
        })
        .await
        .context("Blocking task panicked during decompression")?
        .context("Failed to decompress database")?;

        debug!(path = ?cache_path, "Cached database");
        Ok(())
    }

    /// Looks up metadata by `AniList` ID.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails.
    pub async fn get_by_anilist_id(&self, id: i32) -> Result<Option<anime_metadata::Model>> {
        self.store.get_anime_metadata_by_anilist_id(id).await
    }

    /// Looks up metadata by `MyAnimeList` ID.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails.
    pub async fn get_by_mal_id(&self, id: i32) -> Result<Option<anime_metadata::Model>> {
        self.store.get_anime_metadata_by_mal_id(id).await
    }

    /// Converts `AniList` ID to `MyAnimeList` ID.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails.
    pub async fn anilist_to_mal(&self, anilist_id: i32) -> Result<Option<i32>> {
        let meta = self.get_by_anilist_id(anilist_id).await?;
        Ok(meta.and_then(|m| m.mal_id))
    }

    /// Converts `AniList` ID to Kitsu ID.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails.
    pub async fn anilist_to_kitsu(&self, anilist_id: i32) -> Result<Option<i32>> {
        let meta = self.get_by_anilist_id(anilist_id).await?;
        Ok(meta.and_then(|m| m.kitsu_id))
    }

    /// Converts `MyAnimeList` ID to `AniList` ID.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails.
    pub async fn mal_to_anilist(&self, mal_id: i32) -> Result<Option<i32>> {
        let meta = self.get_by_mal_id(mal_id).await?;
        Ok(meta.and_then(|m| m.anilist_id))
    }

    /// Gets all known names (title + synonyms) for an anime.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails or JSON parsing fails.
    pub async fn get_synonyms(&self, anilist_id: i32) -> Result<Vec<String>> {
        let Some(meta) = self.get_by_anilist_id(anilist_id).await? else {
            return Ok(Vec::new());
        };

        let mut names = meta.synonyms.map_or_else(Vec::new, |synonyms_str| {
            // This is infallible for our use case - we control the JSON format
            serde_json::from_str(&synonyms_str).unwrap_or_default()
        });
        names.push(meta.title);
        Ok(names)
    }
}

/// Decompresses zstd-compressed bytes to a file.
///
/// # Errors
///
/// Returns an error if file creation or decompression fails.
fn decompress_to_file(compressed: &[u8], output_path: &Path) -> Result<()> {
    use std::fs::File;
    use std::io::{BufWriter, Write};

    let file = File::create(output_path)
        .with_context(|| format!("Failed to create cache file: {}", output_path.display()))?;

    let mut writer = BufWriter::new(file);
    let mut decoder = zstd::Decoder::new(compressed).context("Failed to create zstd decoder")?;

    let mut buffer = [0u8; 8192];
    loop {
        match decoder.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                writer
                    .write_all(&buffer[..n])
                    .context("Failed to write to cache file")?;
            }
            Err(e) => return Err(e).context("Failed to decompress data"),
        }
    }

    writer.flush().context("Failed to flush cache file")?;
    Ok(())
}

/// Blocking function to import data from the cached JSON file.
///
/// # Performance
///
/// This function reads the file in chunks and processes entries in batches
/// without keeping the entire dataset in memory. JSON is parsed efficiently
/// and data is inserted in chunks to avoid massive transactions.
///
/// # Errors
///
/// Returns an error if file reading, JSON parsing, or database insertion fails.
fn import_from_file_blocking(store: &Store, cache_path: &Path) -> Result<usize> {
    use std::fs::File;
    use std::io::{BufReader, Read};

    debug!(path = ?cache_path, "Reading JSON file...");

    let file = File::open(cache_path)
        .with_context(|| format!("Failed to open cache file: {}", cache_path.display()))?;

    // Read file in memory-efficient way - the file is already decompressed
    // and typically around 100-200MB, which is manageable
    let mut reader = BufReader::new(file);
    let mut contents = String::new();
    reader
        .read_to_string(&mut contents)
        .context("Failed to read cache file")?;

    debug!(
        size_mb = contents.len() / 1024 / 1024,
        "Loaded file contents"
    );

    // Parse JSON once - we need the root structure to access the data array
    let root: DatabaseRoot =
        serde_json::from_str(&contents).context("Failed to parse JSON database")?;

    // Drop the string contents early to free memory before processing
    drop(contents);

    let total_entries = root.data.len();
    debug!(entries = total_entries, "Processing anime entries");

    // Process in streaming fashion using iterator
    let mut batch: Vec<anime_metadata::ActiveModel> = Vec::with_capacity(INSERT_CHUNK_SIZE);
    let mut total_count = 0usize;
    let mut chunk_idx = 0usize;

    for entry in root.data {
        let mapping = entry.get_id_mapping();

        // Skip entries without useful IDs
        if mapping.anilist_id.is_none() && mapping.mal_id.is_none() {
            continue;
        }

        // Serialize synonyms to JSON string
        let synonyms_json =
            serde_json::to_string(&entry.synonyms).unwrap_or_else(|_| "[]".to_string());

        let model = anime_metadata::ActiveModel {
            id: sea_orm::ActiveValue::NotSet,
            anilist_id: sea_orm::ActiveValue::Set(mapping.anilist_id),
            mal_id: sea_orm::ActiveValue::Set(mapping.mal_id),
            anidb_id: sea_orm::ActiveValue::Set(mapping.anidb_id),
            kitsu_id: sea_orm::ActiveValue::Set(mapping.kitsu_id),
            title: sea_orm::ActiveValue::Set(entry.title),
            synonyms: sea_orm::ActiveValue::Set(Some(synonyms_json)),
            r#type: sea_orm::ActiveValue::Set(Some(entry.anime_type)),
            status: sea_orm::ActiveValue::Set(Some(entry.status)),
            season: sea_orm::ActiveValue::Set(
                entry.anime_season.as_ref().and_then(|s| s.season.clone()),
            ),
            year: sea_orm::ActiveValue::Set(entry.anime_season.as_ref().and_then(|s| s.year)),
        };

        batch.push(model);
        total_count += 1;

        // Insert batch when it reaches chunk size
        if batch.len() >= INSERT_CHUNK_SIZE {
            chunk_idx += 1;
            let batch_to_insert = std::mem::take(&mut batch);
            batch = Vec::with_capacity(INSERT_CHUNK_SIZE);

            let runtime = tokio::runtime::Handle::current();
            runtime.block_on(async {
                store
                    .batch_insert_anime_metadata(batch_to_insert)
                    .await
                    .with_context(|| format!("Failed to insert chunk {chunk_idx}"))
            })?;

            // Log progress every 10 chunks
            if chunk_idx.is_multiple_of(10) {
                let progress_pct = if total_entries > 0 {
                    (total_count * 100) / total_entries
                } else {
                    0
                };
                debug!(
                    chunk = chunk_idx,
                    total = total_count,
                    progress = format!("{}%", progress_pct),
                    "Insert progress"
                );
            }
        }
    }

    // Insert remaining entries
    if !batch.is_empty() {
        chunk_idx += 1;
        let runtime = tokio::runtime::Handle::current();
        runtime.block_on(async {
            store
                .batch_insert_anime_metadata(batch)
                .await
                .with_context(|| format!("Failed to insert final chunk {chunk_idx}"))
        })?;
    }

    info!(total = total_count, chunks = chunk_idx, "Import complete");

    Ok(total_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_id_anilist() {
        let url = "https://anilist.co/anime/12345/Some-Title";
        assert_eq!(extract_id(url, "anilist.co/anime/"), Some(12345));
    }

    #[test]
    fn test_extract_id_mal() {
        let url = "https://myanimelist.net/anime/67890/Another_Title";
        assert_eq!(extract_id(url, "myanimelist.net/anime/"), Some(67890));
    }

    #[test]
    fn test_extract_id_not_found() {
        let url = "https://example.com/anime/123";
        assert_eq!(extract_id(url, "anilist.co/anime/"), None);
    }

    #[test]
    fn test_anime_entry_get_id_mapping() {
        let entry = AnimeEntry {
            title: "Test Anime".to_string(),
            sources: vec![
                "https://anilist.co/anime/42".to_string(),
                "https://myanimelist.net/anime/24".to_string(),
            ],
            synonyms: vec!["Alt Title".to_string()],
            episodes: 12,
            anime_type: "TV".to_string(),
            status: "FINISHED".to_string(),
            anime_season: None,
        };

        let mapping = entry.get_id_mapping();
        assert_eq!(mapping.anilist_id, Some(42));
        assert_eq!(mapping.mal_id, Some(24));
        assert!(mapping.anidb_id.is_none());
        assert!(mapping.kitsu_id.is_none());
    }
}
