mod commands;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "bakarr")]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    #[command(alias = "-d", alias = "--daemon")]
    Daemon,

    #[command(alias = "-c", alias = "--check")]
    Check,

    #[command(alias = "a")]
    Add {
        #[arg(required = true)]
        query: Vec<String>,
    },

    #[command(alias = "ls", alias = "l")]
    List,

    #[command(alias = "rm", alias = "r")]
    Remove {
        id: String,
    },

    #[command(alias = "s")]
    Search {
        #[arg(required = true)]
        query: Vec<String>,
    },

    #[command(alias = "i")]
    Info {
        id: String,

        #[arg(long)]
        refresh_episodes: bool,
    },

    #[command(alias = "h")]
    History {
        #[arg(default_value = "10")]
        limit: i32,
    },

    Rss {
        #[command(subcommand)]
        command: RssCommands,
    },

    #[command(alias = "w", alias = "missing")]
    Wanted {
        anime_id: Option<i32>,
    },

    #[command(alias = "scan-library")]
    Scan,

    Import {
        path: String,

        #[arg(long)]
        anime: Option<i32>,

        #[arg(long)]
        dry_run: bool,
    },

    SearchMissing,

    #[command(alias = "--init")]
    Init,

    Profile {
        #[command(subcommand)]
        command: ProfileCommands,
    },

    Episodes {
        id: String,

        #[arg(long)]
        refresh: bool,
    },

    Web,
}

#[derive(Subcommand)]
pub enum RssCommands {
    Add {
        anime_id: String,

        group: Option<String>,

        resolution: Option<String>,
    },

    #[command(alias = "ls")]
    List {
        anime_id: Option<String>,
    },

    #[command(alias = "rm")]
    Remove {
        feed_id: String,
    },

    Check,
}

#[derive(Subcommand)]
pub enum ProfileCommands {
    #[command(alias = "ls")]
    List,

    Show {
        name: String,
    },

    Create {
        name: String,
    },

    Edit {
        name: String,
    },

    #[command(alias = "rm")]
    Delete {
        name: String,
    },
}

pub use commands::*;
