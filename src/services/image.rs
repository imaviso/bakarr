use crate::config::Config;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::fs;
use tracing::info;

pub struct ImageService {
    config: Config,
}

pub enum ImageType {
    Cover,
    Banner,
}

impl ImageType {
    const fn as_str(&self) -> &'static str {
        match self {
            Self::Cover => "cover",
            Self::Banner => "banner",
        }
    }
}

impl ImageService {
    #[must_use]
    pub const fn new(config: Config) -> Self {
        Self { config }
    }

    pub async fn save_image(
        &self,
        url: &str,
        anime_id: i32,
        image_type: ImageType,
    ) -> Result<String> {
        let extension = Path::new(url)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");

        let filename = format!("{}_{}.{}", anime_id, image_type.as_str(), extension);

        let images_dir = DataDir::get_images_dir(&self.config.general.images_path);
        if !images_dir.exists() {
            fs::create_dir_all(&images_dir).await?;
        }

        let file_path = images_dir.join(&filename);

        info!(url = %url, path = %file_path.display(), "Downloading image");

        let response = reqwest::get(url).await?;
        let bytes = response.bytes().await?;

        fs::write(&file_path, bytes)
            .await
            .with_context(|| format!("Failed to write image to {}", file_path.display()))?;

        Ok(filename)
    }
}

struct DataDir;

impl DataDir {
    fn get_images_dir(configured_path: &str) -> PathBuf {
        PathBuf::from(configured_path)
    }
}
