pub mod api;
pub mod cli;
pub mod clients;
pub mod config;
pub mod constants;
pub mod db;
pub mod entities;
pub mod library;
pub mod models;
pub mod parser;
pub mod quality;
pub mod services;
pub mod state;

use anyhow::Context;
use clap::Parser;
use cli::{Cli, Commands, ProfileCommands, RssCommands};
use std::sync::Arc;
use tokio::signal;
use tokio::sync::RwLock;
use tracing::{error, info};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

pub use config::Config;
use services::scheduler::Scheduler;
use state::SharedState;

pub async fn run() -> anyhow::Result<()> {
    let config = Config::load()?;
    run_with_config(config).await
}

pub async fn run_with_config(config: Config) -> anyhow::Result<()> {
    config.validate()?;

    let prometheus_handle = init_prometheus(&config)?;
    init_logging(&config)?;

    let cli = Cli::parse();
    execute_command(cli, config, prometheus_handle).await
}

fn init_prometheus(
    config: &Config,
) -> anyhow::Result<Option<metrics_exporter_prometheus::PrometheusHandle>> {
    if config.observability.metrics_enabled {
        use metrics_exporter_prometheus::PrometheusBuilder;
        let builder = PrometheusBuilder::new();
        let handle = builder
            .install_recorder()
            .context("Failed to install Prometheus recorder")?;
        info!("Prometheus metrics recorder initialized");
        Ok(Some(handle))
    } else {
        Ok(None)
    }
}

fn init_logging(config: &Config) -> anyhow::Result<()> {
    let mut log_level = config.general.log_level.clone();
    if config.general.suppress_connection_errors {
        log_level.push_str(",reqwest::retry=off,hyper_util=off");
    }

    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&log_level));

    let registry = tracing_subscriber::registry().with(env_filter);

    let use_json = config.observability.loki_enabled
        || std::env::var("LOG_FORMAT").unwrap_or_default() == "json";

    if use_json {
        let fmt_layer = tracing_subscriber::fmt::layer()
            .json()
            .flatten_event(true)
            .with_current_span(true)
            .with_span_list(false);

        if config.observability.loki_enabled {
            let url =
                url::Url::parse(&config.observability.loki_url).context("Invalid Loki URL")?;

            let (loki_layer, task) = tracing_loki::builder()
                .label("app", "bakarr")?
                .extra_field("env", "production")?
                .extra_field("version", env!("CARGO_PKG_VERSION"))?
                .build_url(url)?;

            tokio::spawn(task);
            registry.with(fmt_layer).with(loki_layer).init();
            info!(
                "Loki logging initialized at {}",
                config.observability.loki_url
            );
        } else {
            registry.with(fmt_layer).init();
        }
    } else {
        let fmt_layer = tracing_subscriber::fmt::layer().pretty();
        registry.with(fmt_layer).init();
    }
    Ok(())
}

async fn execute_command(
    cli: Cli,
    config: Config,
    prometheus_handle: Option<metrics_exporter_prometheus::PrometheusHandle>,
) -> anyhow::Result<()> {
    match cli.command {
        None => {
            use clap::CommandFactory;
            Cli::command().print_help()?;
            println!();
            Ok(())
        }

        Some(Commands::Daemon) => run_daemon(config, prometheus_handle).await,

        Some(Commands::Check) => run_single_check(config).await,

        Some(Commands::Add { query }) => {
            let query_str = query.join(" ");
            cli::cmd_add_anime(&config, &query_str).await
        }

        Some(Commands::List) => cli::cmd_list_anime(&config).await,

        Some(Commands::Remove { id }) => cli::cmd_remove_anime(&config, &id).await,

        Some(Commands::Search { query }) => {
            let query_str = query.join(" ");
            cli::cmd_search_anime(&config, &query_str).await
        }

        Some(Commands::Info {
            id,
            refresh_episodes,
        }) => cli::cmd_anime_info(&config, &id, refresh_episodes).await,

        Some(Commands::History { limit }) => cli::cmd_history(&config, limit).await,

        Some(Commands::Rss { command }) => match command {
            RssCommands::Add {
                anime_id,
                group,
                resolution,
            } => {
                cli::cmd_rss_add(&config, &anime_id, group.as_deref(), resolution.as_deref()).await
            }
            RssCommands::List { anime_id } => cli::cmd_rss_list(&config, anime_id.as_deref()).await,
            RssCommands::Remove { feed_id } => cli::cmd_rss_remove(&config, &feed_id).await,
            RssCommands::Check => cli::cmd_rss_check(&config).await,
        },

        Some(Commands::Wanted { anime_id }) => cli::cmd_wanted(&config, anime_id).await,

        Some(Commands::Scan) => cli::cmd_scan_library(&config).await,

        Some(Commands::Import {
            path,
            anime,
            dry_run,
        }) => cli::cmd_import(&config, &path, anime, dry_run).await,

        Some(Commands::SearchMissing) => cli::cmd_search_missing(&config).await,

        Some(Commands::Init) => {
            Config::create_default_if_missing()?;
            println!("✓ Config file created. Edit config.toml and run again.");
            Ok(())
        }

        Some(Commands::Profile { command }) => match command {
            ProfileCommands::List => cli::cmd_profile_list(&config).await,
            ProfileCommands::Show { name } => cli::cmd_profile_show(&config, &name).await,
            ProfileCommands::Create { name } => cli::cmd_profile_create(&config, &name).await,
            ProfileCommands::Edit { name } => cli::cmd_profile_edit(&config, &name).await,
            ProfileCommands::Delete { name } => cli::cmd_profile_delete(&config, &name).await,
        },

        Some(Commands::Episodes { id, refresh }) => cli::cmd_episodes(&config, &id, refresh).await,

        Some(Commands::Web) => {
            info!("Starting web server only mode...");
            let api_state =
                api::create_app_state_from_config(config.clone(), prometheus_handle).await?;
            let port = config.server.port;
            info!("Starting Web API on port {}", port);

            let app = api::router(api_state).await;
            let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
            axum::serve(listener, app).await?;
            Ok(())
        }
    }
}

async fn run_daemon(
    config: Config,
    prometheus_handle: Option<metrics_exporter_prometheus::PrometheusHandle>,
) -> anyhow::Result<()> {
    info!(
        "Bakarr v{} starting in daemon mode...",
        env!("CARGO_PKG_VERSION")
    );

    let shared = Arc::new(SharedState::new(config.clone()).await?);

    let api_state = api::create_app_state(Arc::clone(&shared), prometheus_handle).await?;

    let scheduler_state = Arc::new(RwLock::new((*shared).clone()));

    let scheduler = Scheduler::new(Arc::clone(&scheduler_state), config.scheduler.clone());

    let scheduler_handle = {
        let sched = scheduler;
        tokio::spawn(async move {
            if let Err(e) = sched.start().await {
                error!("Scheduler error: {}", e);
            }
        })
    };

    let monitor = crate::services::monitor::Monitor::new(Arc::clone(&scheduler_state));
    let monitor_handle = tokio::spawn(async move {
        monitor.start().await;
    });

    let server_handle: Option<tokio::task::JoinHandle<()>> = if config.server.enabled {
        let port = config.server.port;
        info!("Starting Web API on port {}", port);

        let app = api::router(api_state).await;
        let addr = format!("0.0.0.0:{port}");
        let listener = tokio::net::TcpListener::bind(&addr).await?;

        Some(tokio::spawn(async move {
            info!("🌐 Web Server running at http://0.0.0.0:{}", port);
            if let Err(e) = axum::serve(listener, app).await {
                error!("Web server error: {}", e);
            }
        }))
    } else {
        None
    };

    info!("Daemon running. Press Ctrl+C to stop.");

    match signal::ctrl_c().await {
        Ok(()) => {
            info!("Shutdown signal received");
        }
        Err(e) => {
            error!("Error listening for shutdown: {}", e);
        }
    }

    scheduler_handle.abort();
    monitor_handle.abort();
    if let Some(handle) = server_handle {
        handle.abort();
    }
    info!("Daemon stopped");

    Ok(())
}

async fn run_single_check(config: Config) -> anyhow::Result<()> {
    info!("Running single check...");

    let shared = SharedState::new(config.clone()).await?;
    let state = Arc::new(RwLock::new(shared));
    let scheduler = Scheduler::new(Arc::clone(&state), config.scheduler.clone());

    scheduler.run_once().await?;

    info!("Check complete");
    Ok(())
}
