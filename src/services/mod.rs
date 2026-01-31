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
pub use rss::{DefaultRssService, RssService};

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

pub mod import_service;
pub mod import_service_impl;
pub use import_service::{ImportError, ImportService};
pub use import_service_impl::DefaultImportService;

pub mod rename_service;
pub mod rename_service_impl;
pub use rename_service::{RenameError, RenamePreviewItem, RenameResult, RenameService};
pub use rename_service_impl::SeaOrmRenameService;

pub mod auth_service;
pub mod auth_service_impl;
pub use auth_service::{AuthError, AuthService, LoginResult, UserInfo};
pub use auth_service_impl::SeaOrmAuthService;

pub mod profile_service;
pub mod profile_service_impl;
pub use profile_service::{ProfileError, ProfileService};
pub use profile_service_impl::SeaOrmProfileService;

pub mod system_service;
pub mod system_service_impl;
pub use system_service::{ExportFormat, SystemError, SystemService};
pub use system_service_impl::SeaOrmSystemService;
