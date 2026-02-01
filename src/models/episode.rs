use sea_orm::FromQueryResult;

#[derive(Debug, Clone)]
pub struct EpisodeInput {
    pub episode_number: i32,
    pub title: Option<String>,
    pub title_japanese: Option<String>,
    pub aired: Option<String>,
    pub filler: bool,
    pub recap: bool,
    /// JSON string tracking which provider filled which metadata field.
    pub metadata_provenance: Option<String>,
}

#[derive(Debug, Clone, FromQueryResult)]
pub struct EpisodeStatusRow {
    pub anime_id: i32,
    pub episode_number: i32,
    pub season: i32,
    pub monitored: bool,
    pub quality_id: Option<i32>,
    pub is_seadex: bool,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub downloaded_at: Option<String>,

    pub resolution_width: Option<i32>,
    pub resolution_height: Option<i32>,
    pub video_codec: Option<String>,
    pub audio_codecs: Option<String>,
    pub duration_secs: Option<f32>,
}

#[derive(Debug, Clone)]
pub struct EpisodeStatusInput {
    pub anime_id: i32,
    pub episode_number: i32,
    pub season: i32,
    pub monitored: bool,
    pub quality_id: Option<i32>,
    pub is_seadex: bool,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub downloaded_at: Option<String>,

    pub resolution_width: Option<i64>,
    pub resolution_height: Option<i64>,
    pub video_codec: Option<String>,
    pub audio_codecs: Option<String>,
    pub duration_secs: Option<f64>,
}
