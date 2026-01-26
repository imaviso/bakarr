use anyhow::{Context, Result};
use std::path::Path;
use tracing::debug;

use crate::models::media::MediaInfo;

pub struct MediaService;

impl Default for MediaService {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaService {
    #[must_use]
    pub const fn new() -> Self {
        Self
    }

    pub fn get_media_info(&self, path: &Path) -> Result<MediaInfo> {
        let output = ffprobe::ffprobe(path)
            .with_context(|| format!("Failed to run ffprobe on {}", path.display()))?;

        let video_stream = output
            .streams
            .iter()
            .find(|s| s.codec_type.as_deref() == Some("video"))
            .context("No video stream found")?;

        let resolution_width = video_stream.width.unwrap_or(0);
        let resolution_height = video_stream.height.unwrap_or(0);
        let video_codec = video_stream
            .codec_name
            .clone()
            .unwrap_or_else(|| "unknown".to_string());

        let duration_secs = output
            .format
            .duration
            .and_then(|d| d.parse::<f64>().ok())
            .or_else(|| {
                video_stream
                    .duration
                    .as_ref()
                    .and_then(|d| d.parse::<f64>().ok())
            })
            .unwrap_or(0.0);

        let audio_codecs: Vec<String> = output
            .streams
            .iter()
            .filter(|s| s.codec_type.as_deref() == Some("audio"))
            .filter_map(|s| s.codec_name.clone())
            .collect();

        debug!(
            "Analyzed media {:?}: {}x{} ({}), {}s",
            path, resolution_width, resolution_height, video_codec, duration_secs
        );

        Ok(MediaInfo {
            resolution_width,
            resolution_height,
            video_codec,
            audio_codecs,
            duration_secs,
        })
    }
}
