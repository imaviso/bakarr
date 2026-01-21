pub mod definition;
pub mod profile;

pub use definition::{get_quality_by_id, get_quality_by_name, Quality, QualitySource, QUALITIES};
pub use profile::{DownloadDecision, QualityProfile};

use crate::models::release::Release;
use crate::parser::filename::parse_filename;

pub fn determine_quality_id(release: &Release) -> i32 {
    let resolution = release
        .resolution
        .as_ref()
        .map(|r| {
            r.to_lowercase()
                .replace("p", "")
                .parse::<u16>()
                .unwrap_or(0)
        })
        .unwrap_or(0);

    let source = release.source.as_ref().map(|s| s.to_uppercase());

    // Check for Remux first
    let is_remux = source
        .as_ref()
        .map(|s| s.contains("REMUX"))
        .unwrap_or(false)
        || release.original_filename.to_lowercase().contains("remux");

    if is_remux {
        return match resolution {
            2160 => 11, // BluRay 2160p Remux
            1080 => 12, // BluRay 1080p Remux
            _ => 12,    // Default to 1080p Remux
        };
    }

    let is_bluray = source
        .as_ref()
        .map(|s| s.contains("BD") || s.contains("BLURAY"))
        .unwrap_or(false);

    // Distinguish between WEB-DL and WEBRip
    let is_webrip = source
        .as_ref()
        .map(|s| s.contains("WEBRIP"))
        .unwrap_or(false);
    let is_web = source.as_ref().map(|s| s.contains("WEB")).unwrap_or(false);

    match (resolution, is_bluray, is_webrip, is_web) {
        (2160, true, _, _) => 1,
        (2160, _, true, _) => 13,
        (2160, _, _, true) => 2,
        (2160, _, _, _) => 2, // Default to WEB-DL 2160p

        (1080, true, _, _) => 3,
        (1080, _, true, _) => 14,
        (1080, _, _, true) => 4,
        (1080, _, _, _) => 4, // Default to WEB-DL 1080p

        (720, true, _, _) => 5,
        (720, _, true, _) => 15,
        (720, _, _, true) => 6,
        (720, _, _, _) => 6, // Default to WEB-DL 720p

        (576, _, _, _) => 9,
        (480, _, _, _) => 10,
        _ => 99,
    }
}

pub fn parse_quality_from_filename(filename: &str) -> Quality {
    let parsed = parse_filename(filename);

    let resolution = parsed
        .as_ref()
        .and_then(|p| p.resolution.as_ref())
        .and_then(|r| parse_resolution(r));

    let mut source = parsed
        .as_ref()
        .and_then(|p| p.source.as_ref())
        .map(|s| parse_source(s))
        .unwrap_or_else(|| infer_source_from_filename(filename));

    // Ensure Remux is detected even if not in the source tag
    if source == QualitySource::BluRay && filename.to_lowercase().contains("remux") {
        source = QualitySource::BluRayRemux;
    }

    Quality::from_source_resolution(source, resolution.unwrap_or(1080))
}

fn parse_resolution(s: &str) -> Option<u16> {
    let lower = s.to_lowercase();
    if lower.contains("2160") || lower.contains("4k") {
        Some(2160)
    } else if lower.contains("1080") {
        Some(1080)
    } else if lower.contains("720") {
        Some(720)
    } else if lower.contains("576") {
        Some(576)
    } else if lower.contains("480") {
        Some(480)
    } else {
        None
    }
}

fn parse_source(s: &str) -> QualitySource {
    let lower = s.to_lowercase();
    if lower.contains("remux") {
        QualitySource::BluRayRemux
    } else if lower.contains("bd") || lower.contains("bluray") || lower.contains("blu-ray") {
        QualitySource::BluRay
    } else if lower.contains("webrip") {
        QualitySource::WebRip
    } else if lower.contains("web") {
        QualitySource::WebDl
    } else if lower.contains("hdtv") {
        QualitySource::HDTV
    } else if lower.contains("dvd") {
        QualitySource::DVD
    } else {
        QualitySource::WebDl
    }
}

fn infer_source_from_filename(filename: &str) -> QualitySource {
    let lower = filename.to_lowercase();

    if lower.contains("remux") {
        return QualitySource::BluRayRemux;
    }

    if lower.contains("bluray")
        || lower.contains("blu-ray")
        || lower.contains("bdremux") // Technically a remux, but double check
        || lower.contains("bdrip")
    {
        if lower.contains("remux") {
            return QualitySource::BluRayRemux;
        }
        return QualitySource::BluRay;
    }

    if lower.contains("webrip") {
        return QualitySource::WebRip;
    }

    if lower.contains("amzn")
        || lower.contains("amazon")
        || lower.contains("cr")
        || lower.contains("crunchyroll")
        || lower.contains("dsnp")
        || lower.contains("disney")
        || lower.contains("nf")
        || lower.contains("netflix")
        || lower.contains("hmax")
        || lower.contains("hulu")
        || lower.contains("web")
    {
        return QualitySource::WebDl;
    }

    if lower.contains("hdtv") {
        return QualitySource::HDTV;
    }

    if lower.contains("dvd") {
        return QualitySource::DVD;
    }

    QualitySource::WebDl
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_quality_subsplease() {
        let q = parse_quality_from_filename("[SubsPlease] Frieren - 05 [1080p].mkv");
        assert_eq!(q.source, QualitySource::WebDl);
        assert_eq!(q.resolution, 1080);
    }

    #[test]
    fn test_parse_quality_bluray() {
        let q = parse_quality_from_filename("[Group] Anime - 01 [1080p BluRay].mkv");
        assert_eq!(q.source, QualitySource::BluRay);
        assert_eq!(q.resolution, 1080);
    }

    #[test]
    fn test_parse_quality_webrip() {
        let q = parse_quality_from_filename("[Group] Anime - 01 [1080p WEBRip].mkv");
        assert_eq!(q.source, QualitySource::WebRip);
        assert_eq!(q.resolution, 1080);
    }

    #[test]
    fn test_parse_quality_remux() {
        let q = parse_quality_from_filename("[Group] Anime - 01 [1080p Remux].mkv");
        assert_eq!(q.source, QualitySource::BluRayRemux);
        assert_eq!(q.resolution, 1080);
    }

    #[test]
    fn test_parse_quality_720p() {
        let q = parse_quality_from_filename("[Group] Anime - 05 [720p].mkv");
        assert_eq!(q.resolution, 720);
    }

    #[test]
    fn test_parse_quality_4k() {
        let q = parse_quality_from_filename("Anime.S01E01.2160p.WEB.mkv");
        assert_eq!(q.resolution, 2160);
    }

    #[test]
    fn test_infer_source_amazon() {
        let source = infer_source_from_filename("[Group] Anime - 01 (AMZN 1080p).mkv");
        assert_eq!(source, QualitySource::WebDl);
    }
}
