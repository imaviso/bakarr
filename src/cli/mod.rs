//! CLI module - Command-line interface for Bakarr
//!
//! This module provides a structured CLI using clap for argument parsing.

mod commands;

use clap::{Parser, Subcommand};

/// Bakarr - Anime Download Manager
/// A Sonarr alternative specifically for anime
#[derive(Parser)]
#[command(name = "bakarr")]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Run as background daemon with scheduler
    #[command(alias = "-d", alias = "--daemon")]
    Daemon,

    /// Run a single check for new episodes
    #[command(alias = "-c", alias = "--check")]
    Check,

    /// Search and add anime to monitor
    #[command(alias = "a")]
    Add {
        /// Search query for anime
        #[arg(required = true)]
        query: Vec<String>,
    },

    /// List all monitored anime
    #[command(alias = "ls", alias = "l")]
    List,

    /// Remove anime from monitoring
    #[command(alias = "rm", alias = "r")]
    Remove {
        /// Anime ID to remove
        id: String,
    },

    /// Search for anime without adding
    #[command(alias = "s")]
    Search {
        /// Search query
        #[arg(required = true)]
        query: Vec<String>,
    },

    /// Show details about a monitored anime
    #[command(alias = "i")]
    Info {
        /// Anime ID
        id: String,
        /// Refresh episode metadata from Jikan
        #[arg(long)]
        refresh_episodes: bool,
    },

    /// Show recent download history
    #[command(alias = "h")]
    History {
        /// Number of entries to show
        #[arg(default_value = "10")]
        limit: i32,
    },

    /// Manage RSS feeds
    Rss {
        #[command(subcommand)]
        command: RssCommands,
    },

    /// Show missing/wanted episodes
    #[command(alias = "w", alias = "missing")]
    Wanted {
        /// Optional anime ID to filter
        anime_id: Option<i32>,
    },

    /// Scan library and update episode status
    #[command(alias = "scan-library")]
    Scan,

    /// Import existing video files
    Import {
        /// Path to import from
        path: String,
        /// Target anime ID
        #[arg(long)]
        anime: Option<i32>,
        /// Dry run mode
        #[arg(long)]
        dry_run: bool,
    },

    /// Search and download missing episodes
    SearchMissing,

    /// Create default config file
    #[command(alias = "--init")]
    Init,

    /// Manage quality profiles
    Profile {
        #[command(subcommand)]
        command: ProfileCommands,
    },

    /// List episodes with titles and status
    Episodes {
        /// Anime ID
        id: String,
        /// Refresh episode data
        #[arg(long)]
        refresh: bool,
    },

    /// Start the web UI server
    Web,
}

#[derive(Subcommand)]
pub enum RssCommands {
    /// Add RSS feed for anime
    Add {
        /// Anime ID
        anime_id: String,
        /// Filter by release group
        group: Option<String>,
        /// Filter by resolution
        resolution: Option<String>,
    },
    /// List RSS feeds
    #[command(alias = "ls")]
    List {
        /// Optional anime ID to filter
        anime_id: Option<String>,
    },
    /// Remove an RSS feed
    #[command(alias = "rm")]
    Remove {
        /// Feed ID to remove
        feed_id: String,
    },
    /// Check all RSS feeds now
    Check,
}

#[derive(Subcommand)]
pub enum ProfileCommands {
    /// List all quality profiles
    #[command(alias = "ls")]
    List,
    /// Show details about a specific profile
    Show {
        /// Profile name
        name: String,
    },
    /// Create a new quality profile (interactive)
    Create {
        /// Profile name
        name: String,
    },
    /// Edit an existing profile (interactive)
    Edit {
        /// Profile name
        name: String,
    },
    /// Delete a quality profile
    #[command(alias = "rm")]
    Delete {
        /// Profile name
        name: String,
    },
}

pub use commands::*;
