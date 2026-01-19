use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Anime {
    pub id: i32,
    pub title: AnimeTitle,
    pub format: String,
    pub episode_count: Option<i32>,
    pub status: String,
    pub quality_profile_id: Option<i32>,
    pub cover_image: Option<String>,
    pub banner_image: Option<String>,
    pub added_at: String,
    pub profile_name: Option<String>,
    pub path: Option<String>,
    pub mal_id: Option<i32>,
    pub description: Option<String>,
    pub score: Option<f32>,
    pub genres: Option<Vec<String>>,
    pub studios: Option<Vec<String>>,
    pub start_year: Option<i32>,
    #[serde(default = "default_true")]
    pub monitored: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimeTitle {
    pub romaji: String,
    pub english: Option<String>,
    pub native: Option<String>,
}
