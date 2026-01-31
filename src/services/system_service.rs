//! Domain service for system-level operations.
//!
//! Handles system status, configuration management, and disk space monitoring.

use crate::api::types::{LogResponse, SystemStatus};
use crate::config::Config;
use std::sync::Arc;
use thiserror::Error;

/// Errors specific to system operations.
#[derive(Debug, Error)]
pub enum SystemError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("External service error: {service} - {message}")]
    ExternalService { service: String, message: String },

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<sea_orm::DbErr> for SystemError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err.to_string())
    }
}

impl From<std::io::Error> for SystemError {
    fn from(err: std::io::Error) -> Self {
        Self::Internal(err.to_string())
    }
}

impl From<anyhow::Error> for SystemError {
    fn from(err: anyhow::Error) -> Self {
        Self::Database(err.to_string())
    }
}

/// Export format for log exports.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ExportFormat {
    #[default]
    Json,
    Csv,
}

/// Domain service trait for system operations.
#[async_trait::async_trait]
pub trait SystemService: Send + Sync {
    /// Retrieves comprehensive system status.
    ///
    /// Aggregates data from multiple sources:
    /// - Monitored anime counts
    /// - Episode statistics (total, missing)
    /// - Active torrents and pending downloads from qBittorrent
    /// - Disk space information
    /// - Last scan and RSS check timestamps
    ///
    /// # Errors
    ///
    /// Returns [`SystemError::Database`] on connection failures.
    /// Returns [`SystemError::ExternalService`] if qBittorrent query fails.
    async fn get_status(
        &self,
        uptime_secs: u64,
        version: &str,
    ) -> Result<SystemStatus, SystemError>;

    /// Gets the current configuration with sensitive data masked.
    ///
    /// Passwords and API keys are replaced with mask strings for security.
    ///
    /// # Errors
    ///
    /// Returns [`SystemError::Internal`] if config access fails.
    async fn get_config(&self) -> Result<Config, SystemError>;

    /// Updates the system configuration.
    ///
    /// Handles password masking - if the new config contains mask strings,
    /// the existing passwords are preserved.
    ///
    /// # Errors
    ///
    /// Returns [`SystemError::Validation`] if config is invalid.
    /// Returns [`SystemError::Internal`] if save fails.
    async fn update_config(
        &self,
        new_config: Config,
        password_mask: &str,
    ) -> Result<(), SystemError>;

    /// Gets disk space information for the library path.
    ///
    /// Uses platform-specific commands (df on Unix) to get disk usage.
    /// This operation is CPU-intensive and runs in a blocking task.
    ///
    /// # Returns
    ///
    /// Returns `Some((free_bytes, total_bytes))` on success, `None` on failure.
    async fn get_disk_space(&self, path: &str) -> Result<Option<(i64, i64)>, SystemError>;

    /// Retrieves paginated system logs.
    ///
    /// # Arguments
    ///
    /// * `page` - Page number (1-based)
    /// * `page_size` - Number of logs per page
    /// * `level` - Optional filter by log level
    /// * `event_type` - Optional filter by event type
    /// * `start_date` - Optional filter for logs after this date
    /// * `end_date` - Optional filter for logs before this date
    ///
    /// # Errors
    ///
    /// Returns [`SystemError::Database`] on connection failures.
    /// Returns [`SystemError::Validation`] if pagination parameters are invalid.
    async fn get_logs(
        &self,
        page: u64,
        page_size: u64,
        level: Option<String>,
        event_type: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<LogResponse, SystemError>;

    /// Exports all system logs in the specified format.
    ///
    /// # Arguments
    ///
    /// * `format` - Export format (JSON or CSV)
    /// * `level` - Optional filter by log level
    /// * `event_type` - Optional filter by event type
    /// * `start_date` - Optional filter for logs after this date
    /// * `end_date` - Optional filter for logs before this date
    ///
    /// # Returns
    ///
    /// Returns the exported data as a string along with content type.
    ///
    /// # Errors
    ///
    /// Returns [`SystemError::Database`] on connection failures.
    async fn export_logs(
        &self,
        format: ExportFormat,
        level: Option<String>,
        event_type: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<(ExportFormat, String), SystemError>;

    /// Clears all system logs.
    ///
    /// # Errors
    ///
    /// Returns [`SystemError::Database`] on connection failures.
    async fn clear_logs(&self) -> Result<bool, SystemError>;

    /// Starts a background task that broadcasts system status updates.
    ///
    /// This method spawns a task that periodically fetches system status
    /// and broadcasts it via the event bus for real-time updates.
    ///
    /// # Arguments
    ///
    /// * `event_bus` - The broadcast channel sender for notification events.
    /// * `uptime_secs` - A function that returns the current uptime in seconds.
    /// * `version` - The application version string.
    fn start_status_broadcaster(
        self: Arc<Self>,
        event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
        uptime_secs: Arc<dyn Fn() -> u64 + Send + Sync>,
        version: String,
    );
}
