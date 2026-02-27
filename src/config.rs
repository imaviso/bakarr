use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub general: GeneralConfig,

    pub qbittorrent: QBittorrentConfig,

    pub nyaa: NyaaConfig,

    pub scheduler: SchedulerConfig,

    pub downloads: DownloadConfig,

    pub library: LibraryConfig,

    #[serde(default)]
    pub profiles: Vec<QualityProfileConfig>,

    /// DEPRECATED: Auth credentials are now stored in the database.
    /// This field is kept for backward compatibility and will be ignored.
    #[serde(default, skip_serializing)]
    pub auth: Option<serde_json::Value>,

    #[serde(default)]
    pub server: ServerConfig,

    #[serde(default)]
    pub observability: ObservabilityConfig,

    #[serde(default)]
    pub security: SecurityConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SecurityConfig {
    /// Argon2 memory cost in KiB (default: 8192 = 8MB)
    /// Lower values reduce memory usage but decrease GPU resistance.
    /// Default balances memory spikes (~19MB -> ~8MB) with reasonable security.
    pub argon2_memory_cost_kib: u32,

    /// Argon2 time cost (iterations) - higher = more CPU work
    /// Default increased to 3 to compensate for lower memory cost.
    pub argon2_time_cost: u32,

    /// Argon2 parallelism (default: 1)
    pub argon2_parallelism: u32,

    /// Whether to auto-migrate passwords to new argon2 params on login
    pub auto_migrate_password_hashes: bool,

    /// Login/password endpoint throttling and lockout policy.
    pub auth_throttle: AuthThrottleConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AuthThrottleConfig {
    /// Max failed attempts in the window before lockout.
    pub max_attempts: u32,

    /// Rolling window for counting failures.
    pub window_seconds: u64,

    /// Temporary lockout duration once max attempts is reached.
    pub lockout_seconds: u64,

    /// Base delay after failed login attempts.
    pub login_base_delay_ms: u64,

    /// Maximum delay cap for failed login attempts.
    pub login_max_delay_ms: u64,

    /// Base delay after failed password-change attempts.
    pub password_base_delay_ms: u64,

    /// Maximum delay cap for failed password-change attempts.
    pub password_max_delay_ms: u64,

    /// Trusted proxy IP addresses allowed to provide forwarded client IP headers.
    ///
    /// When empty, forwarded headers are ignored for rate-limiting identity and
    /// the socket peer address is used.
    pub trusted_proxy_ips: Vec<String>,
}

impl Default for AuthThrottleConfig {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            window_seconds: 5 * 60,
            lockout_seconds: 2 * 60,
            login_base_delay_ms: 250,
            login_max_delay_ms: 1500,
            password_base_delay_ms: 300,
            password_max_delay_ms: 2000,
            trusted_proxy_ips: Vec::new(),
        }
    }
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            argon2_memory_cost_kib: 8192, // 8MB instead of 19MB
            argon2_time_cost: 3,          // Compensate with more iterations
            argon2_parallelism: 1,
            auto_migrate_password_hashes: true,
            auth_throttle: AuthThrottleConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ObservabilityConfig {
    pub metrics_enabled: bool,

    pub metrics_port: Option<u16>,

    pub loki_enabled: bool,

    pub loki_url: String,

    pub loki_labels: std::collections::HashMap<String, String>,
}

impl Default for ObservabilityConfig {
    fn default() -> Self {
        let mut labels = std::collections::HashMap::new();
        labels.insert("app".to_string(), "bakarr".to_string());

        Self {
            metrics_enabled: true,
            metrics_port: None,
            loki_enabled: false,
            loki_url: "http://localhost:3100".to_string(),
            loki_labels: labels,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub enabled: bool,

    pub port: u16,

    pub cors_allowed_origins: Vec<String>,

    /// Whether to set the Secure flag on session cookies.
    /// Default: true for production safety. Set to false for local development without HTTPS.
    pub secure_cookies: bool,

    /// Whether to allow API key authentication via query parameter (?`api_key`=).
    /// Default: false for security. Enable only if needed for SSE or legacy clients.
    /// WARNING: API keys in URLs can leak via browser history, logs, and referrers.
    pub allow_api_key_in_query: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 6789,
            cors_allowed_origins: vec![
                "http://localhost:6789".to_string(),
                "http://127.0.0.1:6789".to_string(),
            ],
            secure_cookies: true,
            allow_api_key_in_query: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityProfileConfig {
    pub name: String,
    pub cutoff: String,
    pub upgrade_allowed: bool,
    pub seadex_preferred: bool,
    pub allowed_qualities: Vec<String>,
    pub min_size: Option<String>,
    pub max_size: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct GeneralConfig {
    pub database_path: String,

    pub log_level: String,

    pub images_path: String,

    #[serde(default)]
    pub suppress_connection_errors: bool,

    /// Event bus buffer size (default: 100)
    pub event_bus_buffer_size: usize,

    /// Number of tokio worker threads (default: 2)
    /// Set to 0 to use the number of CPU cores
    pub worker_threads: usize,

    /// Maximum database connections (default: 5)
    pub max_db_connections: u32,

    /// Minimum database connections (default: 1)
    pub min_db_connections: u32,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            database_path: "sqlite:data/bakarr.db".to_string(),
            log_level: "info".to_string(),
            images_path: "images".to_string(),
            suppress_connection_errors: false,
            event_bus_buffer_size: 100,
            worker_threads: 2,
            max_db_connections: 5,
            min_db_connections: 1,
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            general: GeneralConfig::default(),
            qbittorrent: QBittorrentConfig::default(),
            nyaa: NyaaConfig::default(),
            scheduler: SchedulerConfig::default(),
            downloads: DownloadConfig::default(),
            library: LibraryConfig::default(),
            profiles: vec![QualityProfileConfig {
                name: "Default".to_string(),
                cutoff: "BluRay 1080p".to_string(),
                upgrade_allowed: true,
                seadex_preferred: true,
                allowed_qualities: vec![
                    "BluRay 2160p Remux".to_string(),
                    "BluRay 2160p".to_string(),
                    "WEB-DL 2160p".to_string(),
                    "WEBRip 2160p".to_string(),
                    "BluRay 1080p Remux".to_string(),
                    "BluRay 1080p".to_string(),
                    "WEB-DL 1080p".to_string(),
                    "WEBRip 1080p".to_string(),
                    "BluRay 720p".to_string(),
                    "WEB-DL 720p".to_string(),
                    "WEBRip 720p".to_string(),
                    "HDTV 1080p".to_string(),
                    "HDTV 720p".to_string(),
                ],
                min_size: None,
                max_size: None,
            }],
            auth: None, // Deprecated: auth is now in database
            server: ServerConfig::default(),
            observability: ObservabilityConfig::default(),
            security: SecurityConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LibraryConfig {
    pub library_path: String,

    pub recycle_path: String,

    pub recycle_cleanup_days: u32,

    pub auto_scan_interval_hours: u32,

    pub naming_format: String,

    pub import_mode: String,

    pub movie_naming_format: String,

    /// Preferred title format for naming: "stored" (use existing folder), "english", or "romaji"
    /// Default is "stored" to maintain consistency with existing library folders
    pub preferred_title: String,
}

impl Default for LibraryConfig {
    fn default() -> Self {
        Self {
            library_path: "./library".to_string(),
            recycle_path: "./recycle".to_string(),
            recycle_cleanup_days: 7,
            auto_scan_interval_hours: 12,
            naming_format:
                "{Series Title}/Season {Season}/{Series Title} - S{Season:02}E{Episode:02} - {Title}"
                    .to_string(),
            import_mode: "Copy".to_string(),
            movie_naming_format: "{Series Title}/{Series Title}".to_string(),
            preferred_title: "stored".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct QBittorrentConfig {
    pub enabled: bool,

    pub url: String,

    pub username: String,

    pub password: String,

    pub default_category: String,

    /// Seconds to wait before considering a stalled torrent as failed (default: 900 = 15 min)
    pub stalled_timeout_seconds: u32,
}

impl Default for QBittorrentConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            url: "http://localhost:8080".to_string(),
            username: "change-me".to_string(),
            password: "change-me".to_string(),
            default_category: "anime".to_string(),
            stalled_timeout_seconds: 900,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct NyaaConfig {
    pub base_url: String,

    pub default_category: String,

    pub filter_remakes: bool,

    pub preferred_resolution: Option<String>,

    pub min_seeders: u32,

    /// Request timeout in seconds (default: 30)
    pub request_timeout_seconds: u32,
}

impl Default for NyaaConfig {
    fn default() -> Self {
        Self {
            base_url: "https://nyaa.si".to_string(),
            default_category: "1_2".to_string(),
            filter_remakes: true,
            preferred_resolution: Some("1080p".to_string()),
            min_seeders: 1,
            request_timeout_seconds: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SchedulerConfig {
    pub enabled: bool,

    pub check_interval_minutes: u32,

    pub cron_expression: Option<String>,

    pub max_concurrent_checks: usize,

    pub check_delay_seconds: u32,

    /// Metadata refresh interval in hours (default: 12)
    pub metadata_refresh_hours: u32,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            check_interval_minutes: 15,
            cron_expression: None,
            max_concurrent_checks: 3,
            check_delay_seconds: 5,
            metadata_refresh_hours: 12,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadConfig {
    pub root_path: String,

    pub create_anime_folders: bool,

    pub preferred_groups: Vec<String>,

    pub use_seadex: bool,

    pub prefer_dual_audio: bool,

    pub preferred_codec: Option<String>,

    pub max_size_gb: f32,

    #[serde(default)]
    pub remote_path_mappings: Vec<(String, String)>,
}

impl Default for DownloadConfig {
    fn default() -> Self {
        Self {
            root_path: "./downloads".to_string(),
            create_anime_folders: true,
            preferred_groups: vec![],
            use_seadex: true,
            prefer_dual_audio: true,
            preferred_codec: None,
            max_size_gb: 0.0,
            remote_path_mappings: vec![],
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        let paths = Self::config_paths();

        for path in &paths {
            if path.exists() {
                info!("Loading config from: {}", path.display());
                return Self::load_from_path(path);
            }
        }

        info!("No config file found, using defaults");
        Ok(Self::default())
    }

    pub fn load_from_path(path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {}", path.display()))?;

        let config: Self = toml::from_str(&content)
            .with_context(|| format!("Failed to parse config file: {}", path.display()))?;

        Ok(config)
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::default_config_path();
        self.save_to_path(&path)
    }

    pub fn save_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = toml::to_string_pretty(self)?;
        std::fs::write(path, content)?;
        info!("Config saved to: {}", path.display());
        Ok(())
    }

    fn config_paths() -> Vec<PathBuf> {
        let mut paths = vec![];

        paths.push(PathBuf::from("config.toml"));

        if let Some(config_dir) = dirs::config_dir() {
            paths.push(config_dir.join("bakarr").join("config.toml"));
        }

        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".bakarr").join("config.toml"));
        }

        paths
    }

    fn default_config_path() -> PathBuf {
        PathBuf::from("config.toml")
    }

    pub fn create_default_if_missing() -> Result<bool> {
        let path = Self::default_config_path();
        if path.exists() {
            Ok(false)
        } else {
            let config = Self::default();
            config.save_to_path(&path)?;
            info!("Created default config file: {}", path.display());
            Ok(true)
        }
    }

    pub fn validate(&self) -> Result<()> {
        if self.qbittorrent.enabled && self.qbittorrent.url.is_empty() {
            anyhow::bail!("qBittorrent URL cannot be empty when enabled");
        }

        if self.scheduler.enabled
            && self.scheduler.check_interval_minutes == 0
            && self.scheduler.cron_expression.is_none()
        {
            anyhow::bail!("Scheduler interval must be > 0 or cron expression must be set");
        }

        Ok(())
    }

    #[must_use]
    pub fn find_profile(&self, name: &str) -> Option<&QualityProfileConfig> {
        self.profiles.iter().find(|p| p.name == name)
    }

    pub fn find_profile_mut(&mut self, name: &str) -> Option<&mut QualityProfileConfig> {
        self.profiles.iter_mut().find(|p| p.name == name)
    }

    pub fn add_profile(&mut self, profile: QualityProfileConfig) -> Result<()> {
        if self.find_profile(&profile.name).is_some() {
            anyhow::bail!("Profile with name '{}' already exists", profile.name);
        }

        self.profiles.push(profile);
        self.save()?;
        Ok(())
    }

    pub fn update_profile(&mut self, name: &str, profile: QualityProfileConfig) -> Result<()> {
        let existing = self
            .find_profile_mut(name)
            .ok_or_else(|| anyhow::anyhow!("Profile '{name}' not found"))?;

        *existing = profile;
        self.save()?;
        Ok(())
    }

    pub fn delete_profile(&mut self, name: &str) -> Result<()> {
        let index = self
            .profiles
            .iter()
            .position(|p| p.name == name)
            .ok_or_else(|| anyhow::anyhow!("Profile '{name}' not found"))?;

        if self.profiles.len() == 1 {
            anyhow::bail!("Cannot delete the last quality profile");
        }

        self.profiles.remove(index);
        self.save()?;
        Ok(())
    }

    #[must_use]
    pub fn default_profile(&self) -> Option<&QualityProfileConfig> {
        self.profiles.first()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.scheduler.check_interval_minutes, 15);
        assert!(config.downloads.use_seadex);
        assert_eq!(config.qbittorrent.url, "http://localhost:8080");
        assert_eq!(config.security.auth_throttle.max_attempts, 5);
        assert_eq!(config.security.auth_throttle.lockout_seconds, 120);
    }

    #[test]
    fn test_config_serialization() {
        let config = Config::default();
        let toml_str = toml::to_string_pretty(&config).unwrap();
        assert!(toml_str.contains("[general]"));
        assert!(toml_str.contains("[qbittorrent]"));
        assert!(toml_str.contains("[scheduler]"));
    }

    #[test]
    fn test_config_deserialization() {
        let toml_str = r#"
            [general]
            log_level = "debug"

            [scheduler]
            check_interval_minutes = 30
        "#;

        let config: Config = toml::from_str(toml_str).unwrap();
        assert_eq!(config.general.log_level, "debug");
        assert_eq!(config.scheduler.check_interval_minutes, 30);

        assert_eq!(config.qbittorrent.url, "http://localhost:8080");
    }
}
