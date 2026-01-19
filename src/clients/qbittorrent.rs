use anyhow::{Context, Result, bail};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use std::collections::HashMap;
use std::fmt;
use tracing::{debug, info, warn};

#[derive(Debug, Clone)]
pub struct QBitConfig {
    pub base_url: String,

    pub username: String,

    pub password: String,
}

impl Default for QBitConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:8080".to_string(),
            username: "admin".to_string(),
            password: "adminadmin".to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TorrentState {
    Error,
    MissingFiles,
    Uploading,
    PausedUP,
    QueuedUP,
    StalledUP,
    #[serde(rename = "checkingUP")]
    CheckingUP,
    #[serde(rename = "forcedUP")]
    ForcedUP,
    #[serde(rename = "stoppedUP")]
    StoppedUP,
    #[serde(rename = "stoppedDL")]
    StoppedDL,
    #[serde(rename = "allocating")]
    Allocating,
    Downloading,
    MetaDL,
    PausedDL,
    QueuedDL,
    StalledDL,
    CheckingDL,
    ForcedDL,
    CheckingResumeData,
    Moving,
    Unknown,
}

impl TorrentState {
    pub fn is_downloading(&self) -> bool {
        matches!(
            self,
            TorrentState::Downloading
                | TorrentState::ForcedDL
                | TorrentState::MetaDL
                | TorrentState::Allocating
        )
    }

    pub fn is_completed(&self) -> bool {
        matches!(
            self,
            TorrentState::Uploading
                | TorrentState::PausedUP
                | TorrentState::QueuedUP
                | TorrentState::StalledUP
                | TorrentState::ForcedUP
        )
    }

    pub fn is_error(&self) -> bool {
        matches!(self, TorrentState::Error | TorrentState::MissingFiles)
    }
}

impl fmt::Display for TorrentState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            TorrentState::Error => "Error",
            TorrentState::MissingFiles => "Missing Files",
            TorrentState::Uploading => "Seeding",
            TorrentState::PausedUP => "Paused (Seeding)",
            TorrentState::QueuedUP => "Queued (Seeding)",
            TorrentState::StalledUP => "Stalled (Seeding)",
            TorrentState::CheckingUP => "Checking",
            TorrentState::ForcedUP => "Forced Seeding",
            TorrentState::Allocating => "Allocating",
            TorrentState::Downloading => "Downloading",
            TorrentState::MetaDL => "Downloading Metadata",
            TorrentState::PausedDL => "Paused",
            TorrentState::QueuedDL => "Queued",
            TorrentState::StalledDL => "Stalled",
            TorrentState::CheckingDL => "Checking",
            TorrentState::ForcedDL => "Forced Download",
            TorrentState::CheckingResumeData => "Checking Resume",
            TorrentState::Moving => "Moving",
            TorrentState::StoppedDL => "Stopped",
            TorrentState::StoppedUP => "Seeding Complete",
            TorrentState::Unknown => "Unknown",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct TorrentInfo {
    pub hash: String,

    pub name: String,

    pub state: TorrentState,

    pub progress: f64,

    pub size: i64,

    pub downloaded: i64,

    pub dlspeed: i64,

    pub upspeed: i64,

    pub num_seeds: i32,

    pub num_leechs: i32,

    pub eta: i64,

    pub save_path: String,

    #[serde(default)]
    pub category: String,

    #[serde(default)]
    pub tags: String,

    #[serde(default)]
    pub content_path: String,

    #[serde(default)]
    pub added_on: i64,
}

#[derive(Debug, Clone, Default)]
pub struct AddTorrentOptions {
    pub save_path: Option<String>,

    pub category: Option<String>,

    pub tags: Option<String>,

    pub paused: bool,

    pub skip_checking: bool,

    pub rename: Option<String>,

    pub first_last_piece_prio: bool,

    pub sequential_download: bool,
}

#[derive(Debug, Clone)]
pub struct QBitClient {
    client: Client,
    config: QBitConfig,
}

impl QBitClient {
    pub fn new(config: QBitConfig) -> Self {
        Self {
            client: Client::builder()
                .cookie_store(true)
                .build()
                .expect("Failed to build HTTP client"),
            config,
        }
    }

    pub fn with_defaults() -> Self {
        Self::new(QBitConfig::default())
    }

    pub async fn login(&self) -> Result<()> {
        let url = format!("{}/api/v2/auth/login", self.config.base_url);

        let params = [
            ("username", self.config.username.as_str()),
            ("password", self.config.password.as_str()),
        ];

        let response = self
            .client
            .post(&url)
            .header("Referer", &self.config.base_url)
            .form(&params)
            .send()
            .await
            .context("Failed to connect to qBittorrent")?;

        let status = response.status();
        let body = response.text().await?;

        if status == StatusCode::OK && body.contains("Ok") {
            info!("Successfully authenticated with qBittorrent");

            Ok(())
        } else if body.contains("Fails") {
            bail!("qBittorrent authentication failed: invalid credentials")
        } else {
            bail!(
                "qBittorrent authentication failed: status={}, body={}",
                status,
                body
            )
        }
    }

    async fn ensure_auth(&self) -> Result<()> {
        let url = format!("{}/api/v2/app/version", self.config.base_url);
        let response = self
            .client
            .get(&url)
            .header("Referer", &self.config.base_url)
            .send()
            .await?;

        if response.status() == StatusCode::FORBIDDEN {
            debug!("Session expired or not authenticated, logging in...");
            self.login().await?;
        }

        Ok(())
    }

    pub async fn get_version(&self) -> Result<String> {
        self.ensure_auth().await?;

        let url = format!("{}/api/v2/app/version", self.config.base_url);
        let response = self
            .client
            .get(&url)
            .header("Referer", &self.config.base_url)
            .send()
            .await?;

        let version = response.text().await?;
        Ok(version)
    }

    pub async fn add_torrent_url(
        &self,
        url: &str,
        options: Option<AddTorrentOptions>,
    ) -> Result<()> {
        self.ensure_auth().await?;

        let api_url = format!("{}/api/v2/torrents/add", self.config.base_url);
        let opts = options.unwrap_or_default();

        let mut form: HashMap<&str, String> = HashMap::new();
        form.insert("urls", url.to_string());

        if let Some(path) = opts.save_path {
            form.insert("savepath", path);
        }
        if let Some(cat) = opts.category {
            form.insert("category", cat);
        }
        if let Some(tags) = opts.tags {
            form.insert("tags", tags);
        }
        if opts.paused {
            form.insert("paused", "true".to_string());
        }
        if opts.skip_checking {
            form.insert("skip_checking", "true".to_string());
        }
        if let Some(name) = opts.rename {
            form.insert("rename", name);
        }
        if opts.first_last_piece_prio {
            form.insert("firstLastPiecePrio", "true".to_string());
        }
        if opts.sequential_download {
            form.insert("sequentialDownload", "true".to_string());
        }

        let response = self
            .client
            .post(&api_url)
            .header("Referer", &self.config.base_url)
            .form(&form)
            .send()
            .await
            .context("Failed to add torrent")?;

        let status = response.status();
        let body = response.text().await?;

        if status == StatusCode::OK {
            info!("Torrent added successfully");
            Ok(())
        } else if status == StatusCode::UNSUPPORTED_MEDIA_TYPE {
            bail!("Torrent file is not valid")
        } else {
            bail!("Failed to add torrent: status={}, body={}", status, body)
        }
    }

    pub async fn add_magnet(
        &self,
        magnet: &str,
        save_path: Option<&str>,
        category: Option<&str>,
    ) -> Result<()> {
        let options = AddTorrentOptions {
            save_path: save_path.map(String::from),
            category: category.map(String::from),
            ..Default::default()
        };
        self.add_torrent_url(magnet, Some(options)).await
    }

    pub async fn get_torrents(&self, category: Option<&str>) -> Result<Vec<TorrentInfo>> {
        self.ensure_auth().await?;

        let mut url = format!("{}/api/v2/torrents/info", self.config.base_url);
        if let Some(cat) = category {
            url = format!("{}?category={}", url, urlencoding::encode(cat));
        }

        let response = self
            .client
            .get(&url)
            .header("Referer", &self.config.base_url)
            .send()
            .await?;

        let text = response.text().await?;

        let torrents: Vec<TorrentInfo> = match serde_json::from_str(&text) {
            Ok(t) => t,
            Err(e) => {
                debug!("Failed to parse qBittorrent response: {}", text);
                let truncated = if text.len() > 1000 {
                    format!("{}...", &text[..1000])
                } else {
                    text
                };
                return Err(anyhow::anyhow!(
                    "Failed to parse response: {} (content: {})",
                    e,
                    truncated
                ));
            }
        };
        Ok(torrents)
    }

    pub async fn get_torrent_count(&self) -> Result<usize> {
        let torrents = self.get_torrents(None).await?;
        Ok(torrents.len())
    }

    pub async fn get_downloading_count(&self) -> Result<usize> {
        let torrents = self.get_torrents(None).await?;
        Ok(torrents
            .into_iter()
            .filter(|t| !t.state.is_completed())
            .count())
    }

    pub async fn get_torrent(&self, hash: &str) -> Result<Option<TorrentInfo>> {
        let torrents = self.get_torrents(None).await?;
        Ok(torrents
            .into_iter()
            .find(|t| t.hash.eq_ignore_ascii_case(hash)))
    }

    pub async fn pause_torrent(&self, hash: &str) -> Result<()> {
        self.ensure_auth().await?;

        let url = format!("{}/api/v2/torrents/pause", self.config.base_url);
        let params = [("hashes", hash)];

        self.client
            .post(&url)
            .header("Referer", &self.config.base_url)
            .form(&params)
            .send()
            .await?;

        Ok(())
    }

    pub async fn resume_torrent(&self, hash: &str) -> Result<()> {
        self.ensure_auth().await?;

        let url = format!("{}/api/v2/torrents/resume", self.config.base_url);
        let params = [("hashes", hash)];

        self.client
            .post(&url)
            .header("Referer", &self.config.base_url)
            .form(&params)
            .send()
            .await?;

        Ok(())
    }

    pub async fn delete_torrent(&self, hash: &str, delete_files: bool) -> Result<()> {
        self.ensure_auth().await?;

        let url = format!("{}/api/v2/torrents/delete", self.config.base_url);
        let params = [
            ("hashes", hash),
            ("deleteFiles", if delete_files { "true" } else { "false" }),
        ];

        self.client
            .post(&url)
            .header("Referer", &self.config.base_url)
            .form(&params)
            .send()
            .await?;

        info!("Deleted torrent: {}", hash);
        Ok(())
    }

    pub async fn set_category(&self, hash: &str, category: &str) -> Result<()> {
        self.ensure_auth().await?;

        let url = format!("{}/api/v2/torrents/setCategory", self.config.base_url);
        let params = [("hashes", hash), ("category", category)];

        self.client
            .post(&url)
            .header("Referer", &self.config.base_url)
            .form(&params)
            .send()
            .await?;

        Ok(())
    }

    pub async fn create_category(&self, category: &str, save_path: Option<&str>) -> Result<()> {
        self.ensure_auth().await?;

        let url = format!("{}/api/v2/torrents/createCategory", self.config.base_url);
        let mut params = vec![("category", category)];
        if let Some(path) = save_path {
            params.push(("savePath", path));
        }

        self.client
            .post(&url)
            .header("Referer", &self.config.base_url)
            .form(&params)
            .send()
            .await?;

        info!("Created category: {}", category);
        Ok(())
    }

    pub async fn get_categories(&self) -> Result<HashMap<String, CategoryInfo>> {
        self.ensure_auth().await?;

        let url = format!("{}/api/v2/torrents/categories", self.config.base_url);
        let response = self
            .client
            .get(&url)
            .header("Referer", &self.config.base_url)
            .send()
            .await?;

        let categories: HashMap<String, CategoryInfo> = response.json().await?;
        Ok(categories)
    }

    pub async fn is_available(&self) -> bool {
        match self.get_version().await {
            Ok(_) => true,
            Err(e) => {
                warn!("qBittorrent not available: {}", e);
                false
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CategoryInfo {
    pub name: String,
    #[serde(rename = "savePath")]
    pub save_path: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_torrent_state_checks() {
        assert!(TorrentState::Downloading.is_downloading());
        assert!(TorrentState::MetaDL.is_downloading());
        assert!(!TorrentState::Uploading.is_downloading());

        assert!(TorrentState::Uploading.is_completed());
        assert!(TorrentState::StalledUP.is_completed());
        assert!(!TorrentState::Downloading.is_completed());

        assert!(TorrentState::Error.is_error());
        assert!(TorrentState::MissingFiles.is_error());
        assert!(!TorrentState::Downloading.is_error());
    }

    #[test]
    fn test_default_config() {
        let config = QBitConfig::default();
        assert_eq!(config.base_url, "http://localhost:8080");
        assert_eq!(config.username, "admin");
        assert_eq!(config.password, "adminadmin");
    }

    #[test]
    fn test_sanitize_category() {
        assert_eq!(sanitize_category("Test:Anime"), "Test_Anime");
        assert_eq!(sanitize_category("a/b\\c"), "a_b_c");
        assert_eq!(sanitize_category("Normal Title"), "Normal Title");
    }
}

pub fn sanitize_category(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}
