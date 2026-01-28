use anyhow::Result;
use serde::Deserialize;
use std::io::Read;
use std::path::Path;
use tracing::info;

use crate::db::Store;
use crate::entities::anime_metadata;

const DATABASE_URL: &str = "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json.zst";

#[derive(Debug, Deserialize)]
struct DatabaseRoot {
    data: Vec<AnimeEntry>,
}

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

#[derive(Debug, Clone, Deserialize)]
pub struct AnimeSeason {
    pub season: Option<String>,
    pub year: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct IdMapping {
    pub anilist_id: Option<i32>,
    pub mal_id: Option<i32>,
    pub anidb_id: Option<i32>,
    pub kitsu_id: Option<i32>,
}

impl AnimeEntry {
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

fn extract_id(url: &str, prefix: &str) -> Option<i32> {
    url.find(prefix)
        .map(|pos| &url[pos + prefix.len()..])
        .and_then(|s| {
            let num_str: String = s.chars().take_while(char::is_ascii_digit).collect();
            num_str.parse().ok()
        })
}

#[derive(Clone)]
pub struct OfflineDatabase {
    store: Store,
}

impl OfflineDatabase {
    #[must_use]
    pub const fn new(store: Store) -> Self {
        Self { store }
    }

    pub async fn initialize(&self) -> Result<()> {
        if !self.store.is_anime_metadata_empty().await? {
            tracing::debug!("Anime metadata database is already populated");
            return Ok(());
        }

        let start = std::time::Instant::now();
        info!(
            event = "offline_db_import_started",
            "Initializing anime offline database..."
        );

        let cache_path = Path::new("data/anime-offline-database.json");

        let json_data = if cache_path.exists() {
            tracing::debug!("Loading cached anime-offline-database");
            std::fs::read_to_string(cache_path)?
        } else {
            tracing::debug!("Downloading anime-offline-database...");
            let client = reqwest::Client::new();
            let compressed = client.get(DATABASE_URL).send().await?.bytes().await?;

            let mut decoder = zstd::Decoder::new(&compressed[..])?;
            let mut json_data = String::new();
            decoder.read_to_string(&mut json_data)?;

            tokio::fs::create_dir_all("data").await?;
            tokio::fs::write(cache_path, &json_data).await?;
            tracing::debug!(path = ?cache_path, "Cached database");

            json_data
        };

        let root: DatabaseRoot = serde_json::from_str(&json_data)?;
        tracing::debug!(entries = root.data.len(), "Loaded anime entries from JSON");

        let mut batch = Vec::new();
        for entry in root.data {
            let mapping = entry.get_id_mapping();

            // Skip if no useful IDs
            if mapping.anilist_id.is_none() && mapping.mal_id.is_none() {
                continue;
            }

            let synonyms_json = serde_json::to_string(&entry.synonyms).unwrap_or_default();

            let model = anime_metadata::ActiveModel {
                id: sea_orm::ActiveValue::NotSet, // Auto-increment
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
        }

        let count = batch.len();
        tracing::debug!(count, "Inserting entries into SQLite...");
        self.store.batch_insert_anime_metadata(batch).await?;

        info!(
            event = "offline_db_import_finished",
            count = count,
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "Anime metadata import complete"
        );

        // Optional: Remove JSON file to save disk space?
        // For now, keep it as cache to avoid re-downloading if DB is wiped.

        Ok(())
    }

    pub async fn get_by_anilist_id(&self, id: i32) -> Result<Option<anime_metadata::Model>> {
        self.store.get_anime_metadata_by_anilist_id(id).await
    }

    pub async fn get_by_mal_id(&self, id: i32) -> Result<Option<anime_metadata::Model>> {
        self.store.get_anime_metadata_by_mal_id(id).await
    }

    pub async fn anilist_to_mal(&self, anilist_id: i32) -> Result<Option<i32>> {
        let meta = self.get_by_anilist_id(anilist_id).await?;
        Ok(meta.and_then(|m| m.mal_id))
    }

    pub async fn anilist_to_kitsu(&self, anilist_id: i32) -> Result<Option<i32>> {
        let meta = self.get_by_anilist_id(anilist_id).await?;
        Ok(meta.and_then(|m| m.kitsu_id))
    }

    pub async fn mal_to_anilist(&self, mal_id: i32) -> Result<Option<i32>> {
        let meta = self.get_by_mal_id(mal_id).await?;
        Ok(meta.and_then(|m| m.anilist_id))
    }

    pub async fn get_synonyms(&self, anilist_id: i32) -> Result<Vec<String>> {
        let Some(meta) = self.get_by_anilist_id(anilist_id).await? else {
            return Ok(Vec::new());
        };

        let mut names = meta.synonyms.map_or_else(Vec::new, |synonyms_str| {
            serde_json::from_str(&synonyms_str).unwrap_or_default()
        });
        names.push(meta.title);
        Ok(names)
    }
}
