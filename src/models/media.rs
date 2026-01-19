use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub resolution_width: i64,
    pub resolution_height: i64,
    pub video_codec: String,
    pub audio_codecs: Vec<String>,
    pub duration_secs: f64,
}

impl MediaInfo {
    pub fn resolution_str(&self) -> String {
        format!("{}x{}", self.resolution_width, self.resolution_height)
    }

    pub fn quality_str(&self) -> String {
        let h = self.resolution_height;
        if h >= 2100 {
            "2160p".to_string()
        } else if h >= 1000 {
            "1080p".to_string()
        } else if h >= 700 {
            "720p".to_string()
        } else if h >= 500 {
            "576p".to_string()
        } else {
            "480p".to_string()
        }
    }
}
