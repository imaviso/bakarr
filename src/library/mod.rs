pub mod recycle;

use crate::config::LibraryConfig;
use crate::models::anime::Anime;
use crate::parser::filename::detect_season_from_title;
use anyhow::Result;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

pub use recycle::RecycleBin;

pub struct LibraryService {
    config: LibraryConfig,
}

pub struct RenamingOptions {
    pub anime: Anime,
    pub episode_number: i32,
    pub season: Option<i32>,
    pub episode_title: String,
    pub quality: Option<String>,
    pub group: Option<String>,
    pub original_filename: Option<String>,
    pub extension: String,

    pub year: Option<i32>,
    pub media_info: Option<crate::models::media::MediaInfo>,
}

impl LibraryService {
    pub fn new(config: LibraryConfig) -> Self {
        Self { config }
    }

    pub fn get_destination_path(&self, options: &RenamingOptions) -> PathBuf {
        let library_root = Path::new(&self.config.library_path);

        let path_str = self.format_path(options);

        library_root
            .join(path_str)
            .with_extension(&options.extension)
    }

    pub fn get_destination_path_with_season(
        &self,
        options: &RenamingOptions,
        season: i32,
    ) -> PathBuf {
        let opts = RenamingOptions {
            anime: options.anime.clone(),
            episode_number: options.episode_number,
            season: Some(season),
            episode_title: options.episode_title.clone(),
            quality: options.quality.clone(),
            group: options.group.clone(),
            original_filename: options.original_filename.clone(),
            extension: options.extension.clone(),
            year: options.year,
            media_info: options.media_info.clone(),
        };
        self.get_destination_path(&opts)
    }

    pub fn format_path(&self, options: &RenamingOptions) -> String {
        let series = get_series_title(&options.anime);
        let season = options
            .season
            .or_else(|| detect_season_from_anime_title(&options.anime))
            .unwrap_or(1);
        let episode = options.episode_number;
        let title = &options.episode_title;

        let format = if options.anime.format == "MOVIE" {
            &self.config.movie_naming_format
        } else {
            &self.config.naming_format
        };

        let season_pad = format!("{:02}", season);
        let episode_pad = format!("{:02}", episode);

        let safe_series = sanitize_filename(&series);
        let safe_title = sanitize_filename(title);
        let safe_quality = options
            .quality
            .as_deref()
            .map(sanitize_filename)
            .unwrap_or_default();
        let safe_group = options
            .group
            .as_deref()
            .map(sanitize_filename)
            .unwrap_or_default();
        let safe_original = options
            .original_filename
            .as_deref()
            .map(sanitize_filename)
            .unwrap_or_default();
        let year_str = options.year.map(|y| y.to_string()).unwrap_or_default();

        let resolution_str = options
            .media_info
            .as_ref()
            .map(|m| m.resolution_str())
            .unwrap_or_default();
        let codec_str = options
            .media_info
            .as_ref()
            .map(|m| m.video_codec.clone())
            .unwrap_or_default();
        let duration_str = options
            .media_info
            .as_ref()
            .map(|m| m.duration_secs.to_string())
            .unwrap_or_default();
        let audio_str = options
            .media_info
            .as_ref()
            .and_then(|m| m.audio_codecs.first().cloned())
            .unwrap_or_default();

        let path_str = format
            .replace("{Series Title}", &safe_series)
            .replace("{Season}", &season.to_string())
            .replace("{Episode}", &episode.to_string())
            .replace("{Season:02}", &season_pad)
            .replace("{Episode:02}", &episode_pad)
            .replace("{Title}", &safe_title)
            .replace("{Quality}", &safe_quality)
            .replace("{Group}", &safe_group)
            .replace("{Original Filename}", &safe_original)
            .replace("{Year}", &year_str)
            .replace("{Resolution}", &resolution_str)
            .replace("{Codec}", &codec_str)
            .replace("{Duration}", &duration_str)
            .replace("{Audio}", &audio_str);

        self.cleanup_path(path_str)
    }

    fn cleanup_path(&self, path: String) -> String {
        let mut p = path;
        let mut prev_len = 0;

        while p.len() != prev_len {
            prev_len = p.len();
            p = p
                .replace("[]", "")
                .replace("()", "")
                .replace("  ", " ")
                .replace(" - - ", " - ")
                .replace(" .", ".");
        }

        // Handle cases where we might have "Title - - S01" due to empty group/quality
        // and trimming
        p = p.replace(" - - ", " - ");

        // Trim specific separators from ends
        let p = p.trim();
        let p = p.trim_end_matches(" - ");
        let p = p.trim_end_matches('-');
        let p = p.trim_start_matches(" - ");
        let p = p.trim_start_matches('-');

        p.trim().to_string()
    }

    pub async fn import_file(&self, source: &Path, destination: &Path) -> Result<()> {
        let destination = if destination.is_relative() {
            std::env::current_dir()?.join(destination)
        } else {
            destination.to_path_buf()
        };

        if let Some(parent) = destination.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        info!("Importing {:?} -> {:?}", source, destination);

        match self.config.import_mode.as_str() {
            "Move" => {
                tokio::fs::rename(source, &destination).await?;
            }
            "Copy" => {
                tokio::fs::copy(source, &destination).await?;
            }
            _ => {
                if let Err(e) = tokio::fs::hard_link(source, &destination).await {
                    warn!("Hardlink failed, falling back to copy: {}", e);
                    tokio::fs::copy(source, &destination).await?;
                }
            }
        }
        Ok(())
    }

    pub async fn import_directory_files(
        &self,
        files: &[(PathBuf, PathBuf)],
    ) -> Result<ImportResult> {
        let mut result = ImportResult::default();

        for (source, destination) in files {
            match self.import_file(source, destination).await {
                Ok(_) => {
                    result.imported += 1;
                    result.imported_files.push(destination.clone());
                }
                Err(e) => {
                    warn!("Failed to import {:?}: {}", source, e);
                    result.failed += 1;
                    result.failed_files.push((source.clone(), e.to_string()));
                }
            }
        }

        Ok(result)
    }
}

#[derive(Debug, Default)]
pub struct ImportResult {
    pub imported: usize,
    pub failed: usize,
    pub imported_files: Vec<PathBuf>,
    pub failed_files: Vec<(PathBuf, String)>,
}

impl ImportResult {
    pub fn is_success(&self) -> bool {
        self.failed == 0
    }

    pub fn total(&self) -> usize {
        self.imported + self.failed
    }
}

fn get_series_title(anime: &Anime) -> String {
    anime
        .title
        .english
        .as_ref()
        .filter(|s| !s.is_empty())
        .unwrap_or(&anime.title.romaji)
        .clone()
}

fn detect_season_from_anime_title(anime: &Anime) -> Option<i32> {
    if let Some(season) = detect_season_from_title(&anime.title.romaji) {
        return Some(season);
    }

    if let Some(ref english) = anime.title.english
        && let Some(season) = detect_season_from_title(english)
    {
        return Some(season);
    }

    None
}

fn sanitize_filename(name: &str) -> String {
    name.replace("/", " ")
        .replace("\\", " ")
        .replace(":", " ")
        .replace("*", " ")
        .replace("?", " ")
        .replace("\"", " ")
        .replace("<", " ")
        .replace(">", " ")
        .replace("|", " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::anime::AnimeTitle;

    fn test_anime(romaji: &str, english: Option<&str>) -> Anime {
        Anime {
            id: 1,
            title: AnimeTitle {
                romaji: romaji.to_string(),
                english: english.map(|s| s.to_string()),
                native: None,
            },
            format: "TV".to_string(),
            episode_count: Some(12),
            status: "FINISHED".to_string(),
            quality_profile_id: None,
            cover_image: None,
            banner_image: None,
            added_at: "2024-01-01T00:00:00Z".to_string(),
            profile_name: None,
            mal_id: None,
            description: None,
            score: None,
            genres: None,
            studios: None,
            path: None,
            start_year: None,
            monitored: true,
        }
    }

    fn test_config() -> LibraryConfig {
        LibraryConfig {
            library_path: "/library".to_string(),
            recycle_path: "/recycle".to_string(),
            recycle_cleanup_days: 7,
            naming_format: "{Series Title}/Season {Season}/{Series Title} - S{Season:02}E{Episode:02} - {Title}".to_string(),
            import_mode: "Hardlink".to_string(),
            movie_naming_format: "{Series Title}/{Series Title}".to_string(),
        }
    }

    #[test]
    fn test_destination_path_default_season() {
        let service = LibraryService::new(test_config());
        let anime = test_anime("Frieren", Some("Frieren: Beyond Journey's End"));

        let options = RenamingOptions {
            anime: anime.clone(),
            episode_number: 5,
            season: None,
            episode_title: "The Hero's Party".to_string(),
            quality: None,
            group: None,
            original_filename: None,
            extension: "mkv".to_string(),
            year: None,
            media_info: None,
        };

        let path = service.get_destination_path(&options);
        let path_str = path.to_str().unwrap();

        assert!(path_str.contains("Frieren Beyond Journey's End"));
        assert!(path_str.contains("Season 1"));
        assert!(path_str.contains("S01E05"));
        assert!(path_str.contains("The Hero's Party"));
    }

    #[test]
    fn test_destination_path_explicit_season() {
        let service = LibraryService::new(test_config());
        let anime = test_anime("Mob Psycho 100", None);

        let options = RenamingOptions {
            anime: anime.clone(),
            episode_number: 8,
            season: None,
            episode_title: "Episode 8".to_string(),
            quality: None,
            group: None,
            original_filename: None,
            extension: "mkv".to_string(),
            year: None,
            media_info: None,
        };

        let path = service.get_destination_path_with_season(&options, 2);

        assert!(path.to_str().unwrap().contains("Season 2"));
        assert!(path.to_str().unwrap().contains("S02E08"));
    }

    #[test]
    fn test_season_detection_from_title() {
        let anime = test_anime("Mob Psycho 100 II", Some("Mob Psycho 100 Season 2"));

        let season = detect_season_from_anime_title(&anime);
        assert_eq!(season, Some(2));
    }

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("Test: Title"), "Test Title");
        assert_eq!(sanitize_filename("A/B\\C"), "A B C");
        assert_eq!(sanitize_filename("Normal Title"), "Normal Title");
    }

    #[test]
    fn test_advanced_renaming() {
        let mut config = test_config();
        config.naming_format =
            "{Series Title} - S{Season:02}E{Episode:02} - [{Group}] [{Quality}]".to_string();
        let service = LibraryService::new(config);
        let anime = test_anime("One Piece", None);

        let options = RenamingOptions {
            anime: anime.clone(),
            episode_number: 1000,
            season: Some(1),
            episode_title: "Episode 1000".to_string(),
            quality: Some("1080p".to_string()),
            group: Some("SubsPlease".to_string()),
            original_filename: Some("One.Piece.E1000.1080p.mkv".to_string()),
            extension: "mkv".to_string(),
            year: None,
            media_info: None,
        };

        let path = service.get_destination_path(&options);
        let path_str = path.to_str().unwrap();

        assert!(path_str.contains("One Piece"));
        assert!(path_str.contains("S01E1000"));
        assert!(path_str.contains("[SubsPlease]"));
        assert!(path_str.contains("[1080p]"));
    }

    #[test]
    fn test_destination_path_movie() {
        let service = LibraryService::new(test_config());
        let mut anime = test_anime("Your Name.", None);
        anime.format = "MOVIE".to_string();

        let options = RenamingOptions {
            anime: anime.clone(),
            episode_number: 1,
            season: Some(1),
            episode_title: "Episode 1".to_string(),
            quality: None,
            group: None,
            original_filename: None,
            extension: "mkv".to_string(),
            year: Some(2016),
            media_info: None,
        };

        let path = service.get_destination_path(&options);
        let path_str = path.to_str().unwrap();

        println!("Generated path: {}", path_str);

        assert!(path_str.contains("Your Name"));
        assert!(!path_str.contains("Season 1"));
        assert!(!path_str.contains("S01E01"));

        let expected_suffix = if cfg!(windows) {
            "Your Name.\\Your Name.mkv"
        } else {
            "Your Name./Your Name.mkv"
        };

        assert!(
            path_str.ends_with(expected_suffix),
            "Expected path to end with '{}', got '{}'",
            expected_suffix,
            path_str
        );
    }

    #[test]
    fn test_series_title_with_year_duplication() {
        let mut anime = test_anime("Fate strange Fake -Whispers of Dawn-", None);

        anime.path = Some("/library/Fate strange Fake -Whispers of Dawn- (2023)".to_string());

        let options = RenamingOptions {
            anime: anime.clone(),
            episode_number: 1,
            season: Some(1),
            episode_title: "Episode 1".to_string(),
            quality: None,
            group: None,
            original_filename: None,
            extension: "mkv".to_string(),
            year: Some(2023),
            media_info: None,
        };

        let mut config = test_config();
        config.naming_format = "{Series Title} ({Year})/Season {Season}/{Series Title} - S{Season:02}E{Episode:02} - {Title}".to_string();
        let service = LibraryService::new(config);

        let path = service.get_destination_path(&options);
        let path_str = path.to_str().unwrap();

        assert!(!path_str.contains("(2023) (2023)"));
        assert!(path_str.contains("Fate strange Fake -Whispers of Dawn- (2023)"));
    }
}
