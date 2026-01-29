use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub const fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AnimeDto {
    pub id: i32,
    pub title: TitleDto,
    pub format: String,
    pub episode_count: Option<i64>,
    pub status: String,
    pub cover_image: Option<String>,
    pub banner_image: Option<String>,
    pub profile_name: String,
    pub root_folder: String,
    pub monitored: bool,
    pub added_at: String,
    pub mal_id: Option<i32>,
    pub description: Option<String>,
    pub score: Option<f32>,
    pub genres: Vec<String>,
    pub studios: Vec<String>,
    pub progress: EpisodeProgress,
    pub release_profile_ids: Vec<i32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TitleDto {
    pub romaji: String,
    pub english: Option<String>,
    pub native: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EpisodeProgress {
    pub downloaded: i64,
    pub total: Option<i64>,
    pub missing: Vec<i32>,
}

#[derive(Debug, Serialize)]
pub struct EpisodeDto {
    pub number: i32,
    pub title: Option<String>,
    pub aired: Option<String>,
    pub downloaded: bool,
    pub file_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DownloadDto {
    pub id: i64,
    pub anime_id: i32,
    pub anime_title: String,
    pub torrent_name: String,
    pub episode_number: f64,
    pub group_name: Option<String>,
    pub download_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfileDto {
    pub name: String,
    pub cutoff: String,
    pub upgrade_allowed: bool,
    pub seadex_preferred: bool,
    pub allowed_qualities: Vec<String>,
    pub min_size: Option<String>,
    pub max_size: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchResultDto {
    pub id: i32,
    pub title: TitleDto,
    pub format: String,
    pub episode_count: Option<i32>,
    pub status: String,
    pub cover_image: Option<String>,
    pub already_in_library: bool,
}

#[derive(Debug, Serialize)]
pub struct SystemStatus {
    pub version: String,
    pub uptime: u64,
    pub monitored_anime: usize,
    pub total_episodes: i64,
    pub missing_episodes: i64,
    pub active_torrents: i64,
    pub pending_downloads: i64,
    pub disk_space: DiskSpaceDto,
    pub last_scan: Option<String>,
    pub last_rss: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DiskSpaceDto {
    pub free: i64,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct VideoFileDto {
    pub name: String,
    pub path: String,
    pub size: i64,
    pub episode_number: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct MapEpisodeRequest {
    pub file_path: String,
}

#[derive(Debug, Deserialize)]
pub struct BulkMapEpisodeRequest {
    pub mappings: Vec<EpisodeMapping>,
}

#[derive(Debug, Deserialize)]
pub struct EpisodeMapping {
    pub episode_number: i32,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QualityDto {
    pub id: i32,
    pub name: String,
    pub source: String,
    pub resolution: u16,
    pub rank: i32,
}
