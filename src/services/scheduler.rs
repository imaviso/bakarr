use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, interval};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{error, info};

use crate::config::SchedulerConfig;
use crate::state::SharedState;

pub type SchedulerState = Arc<RwLock<SharedState>>;

pub struct Scheduler {
    state: SchedulerState,
    config: SchedulerConfig,
    running: Arc<RwLock<bool>>,
}

impl Scheduler {
    pub fn new(state: SchedulerState, config: SchedulerConfig) -> Self {
        Self {
            state,
            config,
            running: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn start(&self) -> Result<()> {
        if !self.config.enabled {
            info!("Scheduler is disabled in config");
            return Ok(());
        }

        *self.running.write().await = true;
        info!("Starting background scheduler");

        if let Some(cron_expr) = &self.config.cron_expression {
            self.run_with_cron(cron_expr).await
        } else {
            self.run_with_interval().await
        }
    }

    async fn run_with_cron(&self, cron_expr: &str) -> Result<()> {
        let mut sched = JobScheduler::new().await?;

        let state = Arc::clone(&self.state);
        let running = Arc::clone(&self.running);
        let delay_secs = self.config.check_delay_seconds;

        // Main anime/rss check job
        let state_for_job = Arc::clone(&state);
        let job = Job::new_async(cron_expr, move |_uuid, _lock| {
            let state = Arc::clone(&state_for_job);
            let running = Arc::clone(&running);
            Box::pin(async move {
                if !*running.read().await {
                    return;
                }
                let start = std::time::Instant::now();
                info!(event = "job_started", job_name = "check_releases", "Starting scheduled release check");

                let auto_downloader = state.read().await.auto_downloader.clone();
                if let Err(e) = auto_downloader.check_all_anime(delay_secs).await {
                    error!(event = "job_failed", job_name = "check_releases", error = %e, "Scheduled anime check failed");
                }

                let rss_service = state.read().await.rss_service.clone();
                if let Err(e) = rss_service.check_feeds(u64::from(delay_secs)).await {
                    error!(event = "job_failed", job_name = "check_rss", error = %e, "Scheduled RSS check failed");
                }

                info!(
                    event = "job_finished",
                    job_name = "check_releases",
                    duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
                    "Scheduled release check finished"
                );
            })
        })?;

        // Metadata refresh job
        let refresh_hours = self.config.metadata_refresh_hours.max(1);
        let refresh_cron = if refresh_hours >= 24 {
            // Run once a day at midnight if >= 24 hours
            "0 0 0 * * *".to_string()
        } else {
            format!("0 0 */{refresh_hours} * * *")
        };

        let state_for_metadata = Arc::clone(&state);
        let metadata_job = Job::new_async(&refresh_cron, move |_uuid, _lock| {
            let state = Arc::clone(&state_for_metadata);
            Box::pin(async move {
                let episodes = state.read().await.episodes.clone();
                if let Err(e) = episodes.refresh_metadata_for_active_anime().await {
                    error!("Scheduled metadata refresh failed: {}", e);
                }
            })
        })?;

        // Library scan job
        let scan_hours = {
            let shared = self.state.read().await;
            shared
                .config
                .read()
                .await
                .library
                .auto_scan_interval_hours
                .max(1)
        };

        let scan_cron = if scan_hours >= 24 {
            // Run once a day at midnight if >= 24 hours
            "0 0 0 * * *".to_string()
        } else {
            format!("0 0 */{scan_hours} * * *")
        };

        let state_for_scan = Arc::clone(&state);
        let scan_job = Job::new_async(&scan_cron, move |_uuid, _lock| {
            let state = Arc::clone(&state_for_scan);
            Box::pin(async move {
                let scanner = state.read().await.library_scanner.clone();
                if let Err(e) = scanner.scan_library_files().await {
                    error!("Scheduled library scan failed: {}", e);
                }
            })
        })?;

        sched.add(job).await?;
        sched.add(metadata_job).await?;
        sched.add(scan_job).await?;
        sched.start().await?;

        info!("Scheduler running with cron: {}", cron_expr);
        info!("Metadata refresh scheduled: {}", refresh_cron);
        info!("Library scan scheduled: {}", scan_cron);

        loop {
            if !*self.running.read().await {
                break;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        sched.shutdown().await?;
        Ok(())
    }

    async fn run_with_interval(&self) -> Result<()> {
        let interval_mins = self.config.check_interval_minutes.max(1);
        let delay_secs = self.config.check_delay_seconds;
        let refresh_hours = self.config.metadata_refresh_hours.max(1);
        let scan_hours = {
            let shared = self.state.read().await;
            shared
                .config
                .read()
                .await
                .library
                .auto_scan_interval_hours
                .max(1)
        };

        info!(
            "Scheduler running: Check every {}m, Metadata every {}h, Scan every {}h",
            interval_mins, refresh_hours, scan_hours
        );

        let mut check_interval = interval(Duration::from_secs(u64::from(interval_mins) * 60));

        let mut metadata_interval =
            interval(Duration::from_secs(u64::from(refresh_hours) * 60 * 60));

        let mut scan_interval = interval(Duration::from_secs(u64::from(scan_hours) * 60 * 60));

        loop {
            tokio::select! {
                _ = check_interval.tick() => {
                    if !*self.running.read().await {
                        break;
                    }
                    let start = std::time::Instant::now();
                    info!(event = "job_started", job_name = "check_releases", "Starting scheduled release check");

                    let auto_downloader = self.state.read().await.auto_downloader.clone();
                    if let Err(e) = auto_downloader.check_all_anime(delay_secs).await {
                         error!(event = "job_failed", job_name = "check_releases", error = %e, "Scheduled anime check failed");
                    }

                    let rss_service = self.state.read().await.rss_service.clone();
                    if let Err(e) = rss_service.check_feeds(u64::from(delay_secs)).await {
                         error!(event = "job_failed", job_name = "check_rss", error = %e, "Scheduled RSS check failed");
                    }

                    info!(
                        event = "job_finished",
                        job_name = "check_releases",
                        duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
                        "Scheduled release check finished"
                    );
                }
                _ = metadata_interval.tick() => {
                    if !*self.running.read().await {
                        break;
                    }

                    let start = std::time::Instant::now();
                    info!(event = "job_started", job_name = "refresh_metadata", "Starting scheduled metadata refresh");

                    if let Err(e) = self.refresh_metadata().await {
                        error!(event = "job_failed", job_name = "refresh_metadata", error = %e, "Scheduled metadata refresh failed");
                    }

                    info!(
                        event = "job_finished",
                        job_name = "refresh_metadata",
                        duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
                        "Scheduled metadata refresh finished"
                    );
                }
                _ = scan_interval.tick() => {
                    if !*self.running.read().await {
                        break;
                    }
                    let start = std::time::Instant::now();
                    info!(event = "job_started", job_name = "scan_library", "Starting scheduled library scan");

                    let scanner = self.state.read().await.library_scanner.clone();
                    if let Err(e) = scanner.scan_library_files().await {
                        error!(event = "job_failed", job_name = "scan_library", error = %e, "Scheduled library scan failed");
                    }

                    info!(
                        event = "job_finished",
                        job_name = "scan_library",
                        duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
                        "Scheduled library scan finished"
                    );
                }
            }
        }

        Ok(())
    }

    pub async fn stop(&self) {
        info!("Stopping scheduler...");
        *self.running.write().await = false;
    }

    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }

    pub async fn run_once(&self) -> Result<()> {
        info!("Running manual check...");

        let auto_downloader = self.state.read().await.auto_downloader.clone();
        auto_downloader
            .check_all_anime(self.config.check_delay_seconds)
            .await?;

        let rss_service = self.state.read().await.rss_service.clone();
        rss_service
            .check_feeds(u64::from(self.config.check_delay_seconds))
            .await?;

        self.refresh_metadata().await?;

        Ok(())
    }

    async fn refresh_metadata(&self) -> Result<()> {
        let episodes = self.state.read().await.episodes.clone();
        episodes.refresh_metadata_for_active_anime().await
    }
}
