use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use tracing::info;

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

    #[must_use]
    pub fn get_start_year(&self) -> Option<i32> {
        self.anime_season.as_ref().and_then(|s| s.year)
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

pub struct OfflineDatabase {
    entries: Vec<AnimeEntry>,
    anilist_index: HashMap<i32, usize>,
    mal_index: HashMap<i32, usize>,
}

impl OfflineDatabase {
    pub async fn load() -> Result<Self> {
        let cache_path = Path::new("data/anime-offline-database.json");

        let json_data = if cache_path.exists() {
            info!("Loading cached anime-offline-database");
            std::fs::read_to_string(cache_path)?
        } else {
            info!("Downloading anime-offline-database...");
            let client = reqwest::Client::new();
            let compressed = client.get(DATABASE_URL).send().await?.bytes().await?;

            let mut decoder = zstd::Decoder::new(&compressed[..])?;
            let mut json_data = String::new();
            decoder.read_to_string(&mut json_data)?;

            tokio::fs::create_dir_all("data").await?;
            tokio::fs::write(cache_path, &json_data).await?;
            info!("Cached database to {:?}", cache_path);

            json_data
        };

        let root: DatabaseRoot = serde_json::from_str(&json_data)?;
        info!("Loaded {} anime entries", root.data.len());

        let mut anilist_index = HashMap::new();
        let mut mal_index = HashMap::new();

        for (idx, entry) in root.data.iter().enumerate() {
            let mapping = entry.get_id_mapping();
            if let Some(id) = mapping.anilist_id {
                anilist_index.insert(id, idx);
            }
            if let Some(id) = mapping.mal_id {
                mal_index.insert(id, idx);
            }
        }

        Ok(Self {
            entries: root.data,
            anilist_index,
            mal_index,
        })
    }

    #[must_use]
    pub fn get_by_anilist_id(&self, id: i32) -> Option<&AnimeEntry> {
        self.anilist_index.get(&id).map(|&idx| &self.entries[idx])
    }

    #[must_use]
    pub fn get_by_mal_id(&self, id: i32) -> Option<&AnimeEntry> {
        self.mal_index.get(&id).map(|&idx| &self.entries[idx])
    }

    #[must_use]
    pub fn anilist_to_mal(&self, anilist_id: i32) -> Option<i32> {
        self.get_by_anilist_id(anilist_id)
            .and_then(|e| e.get_id_mapping().mal_id)
    }

    #[must_use]
    pub fn anilist_to_kitsu(&self, anilist_id: i32) -> Option<i32> {
        self.get_by_anilist_id(anilist_id)
            .and_then(|e| e.get_id_mapping().kitsu_id)
    }

    #[must_use]
    pub fn mal_to_anilist(&self, mal_id: i32) -> Option<i32> {
        self.get_by_mal_id(mal_id)
            .and_then(|e| e.get_id_mapping().anilist_id)
    }

    #[must_use]
    pub fn get_synonyms(&self, anilist_id: i32) -> Vec<String> {
        self.get_by_anilist_id(anilist_id)
            .map(|e| {
                let mut names = e.synonyms.clone();
                names.push(e.title.clone());
                names
            })
            .unwrap_or_default()
    }
}
