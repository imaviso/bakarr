pub mod auto_download;
pub use auto_download::AutoDownloadService;

pub mod anime;
pub use anime::AnimeMetadataService;

pub mod anime_service;
pub use anime_service::{AnimeError, AnimeService};

pub mod anime_service_impl;
pub use anime_service_impl::SeaOrmAnimeService;

pub mod download;
pub mod download_service;
pub mod download_service_impl;
pub mod episode_service;
pub mod episode_service_impl;
pub mod episodes;
pub mod image;
pub mod logs;

pub use download::DownloadDecisionService;
pub use download_service::{DownloadError, DownloadService};
pub use download_service_impl::SeaOrmDownloadService;
pub use episode_service::{EpisodeError, EpisodeService};
pub use episode_service_impl::SeaOrmEpisodeService;
pub use episodes::EpisodeService as OldEpisodeService;
pub use image::ImageService;
pub use logs::LogService;
pub mod search;
pub use search::SearchService;

pub mod rss;
pub use rss::RssService;

pub mod media;
pub use media::MediaService;

pub mod scanner;
pub use scanner::LibraryScannerService;

pub mod monitor;
pub use monitor::Monitor;

pub mod scheduler;
pub use scheduler::Scheduler;

pub mod seadex;
pub use seadex::SeaDexService;

pub mod library_service;
pub use library_service::{
    ActivityItem, ImportFolderRequest, LibraryError, LibraryService, LibraryStats,
};

pub mod library_service_impl;
pub use library_service_impl::{
    SeaOrmLibraryService, collect_and_parse_episodes, scan_folder_for_episodes,
};
