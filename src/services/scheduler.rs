use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, interval};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{error, info};

use crate::config::SchedulerConfig;
use crate::state::SharedState;

/// Type alias for scheduler state - uses SharedState wrapped in Arc<RwLock> for thread-safety.
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

        let job = Job::new_async(cron_expr, move |_uuid, _lock| {
            let state = Arc::clone(&state);
            let running = Arc::clone(&running);
            Box::pin(async move {
                if !*running.read().await {
                    return;
                }
                if let Err(e) = state
                    .read()
                    .await
                    .auto_downloader
                    .check_all_anime(delay_secs)
                    .await
                {
                    error!("Scheduled anime check failed: {}", e);
                }

                if let Err(e) = state
                    .read()
                    .await
                    .rss_service
                    .check_feeds(delay_secs as u64)
                    .await
                {
                    error!("Scheduled RSS check failed: {}", e);
                }
            })
        })?;

        let metadata_job = Job::new_async("0 0 */12 * * *", move |_uuid, _lock| {
            Box::pin(async move {})
        })?;

        sched.add(job).await?;
        sched.add(metadata_job).await?;
        sched.start().await?;

        info!("Scheduler running with cron: {}", cron_expr);

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
        let interval_mins = self.config.check_interval_minutes;
        let delay_secs = self.config.check_delay_seconds;
        let refresh_hours = self.config.metadata_refresh_hours;

        info!("Scheduler running every {} minutes", interval_mins);

        let mut check_interval = interval(Duration::from_secs(interval_mins as u64 * 60));

        let mut metadata_interval = interval(Duration::from_secs(refresh_hours as u64 * 60 * 60));

        loop {
            tokio::select! {
                _ = check_interval.tick() => {
                    if !*self.running.read().await {
                        break;
                    }
                    info!("Running scheduled checks...");
                    if let Err(e) = self.state.read().await.auto_downloader.check_all_anime(delay_secs).await {
                        error!("Scheduled anime check failed: {}", e);
                    }
                    if let Err(e) = self.state.read().await.rss_service.check_feeds(delay_secs as u64).await {
                        error!("Scheduled RSS check failed: {}", e);
                    }
                }
                _ = metadata_interval.tick() => {
                    if !*self.running.read().await {
                        break;
                    }
                    if let Err(e) = self.refresh_metadata().await {
                        error!("Scheduled metadata refresh failed: {}", e);
                    }
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

        self.state
            .read()
            .await
            .auto_downloader
            .check_all_anime(self.config.check_delay_seconds)
            .await?;

        self.state
            .read()
            .await
            .rss_service
            .check_feeds(self.config.check_delay_seconds as u64)
            .await?;

        self.refresh_metadata().await?;

        Ok(())
    }

    async fn refresh_metadata(&self) -> Result<()> {
        self.state
            .read()
            .await
            .episodes
            .refresh_metadata_for_active_anime()
            .await
    }
}
