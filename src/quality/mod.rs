pub mod definition;
pub mod profile;

pub use definition::{QUALITIES, Quality, QualitySource, get_quality_by_id, get_quality_by_name};
pub use profile::{DownloadDecision, QualityProfile};

use crate::parser::filename::parse_filename;

pub fn parse_quality_from_filename(filename: &str) -> Quality {
    let parsed = parse_filename(filename);

    let resolution = parsed
        .as_ref()
        .and_then(|p| p.resolution.as_ref())
        .and_then(|r| parse_resolution(r));

    let source = parsed
        .as_ref()
        .and_then(|p| p.source.as_ref())
        .map(|s| parse_source(s))
        .unwrap_or_else(|| infer_source_from_filename(filename));

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
    if lower.contains("bd") || lower.contains("bluray") || lower.contains("blu-ray") {
        QualitySource::BluRay
    } else if lower.contains("web") {
        QualitySource::Web
    } else if lower.contains("hdtv") {
        QualitySource::HDTV
    } else if lower.contains("dvd") {
        QualitySource::DVD
    } else {
        QualitySource::Web
    }
}

fn infer_source_from_filename(filename: &str) -> QualitySource {
    let lower = filename.to_lowercase();

    if lower.contains("bluray")
        || lower.contains("blu-ray")
        || lower.contains("bdremux")
        || lower.contains("bdrip")
    {
        return QualitySource::BluRay;
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
        return QualitySource::Web;
    }

    if lower.contains("hdtv") {
        return QualitySource::HDTV;
    }

    if lower.contains("dvd") {
        return QualitySource::DVD;
    }

    QualitySource::Web
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_quality_subsplease() {
        let q = parse_quality_from_filename("[SubsPlease] Frieren - 05 [1080p].mkv");
        assert_eq!(q.source, QualitySource::Web);
        assert_eq!(q.resolution, 1080);
    }

    #[test]
    fn test_parse_quality_bluray() {
        let q = parse_quality_from_filename("[Group] Anime - 01 [1080p BluRay].mkv");
        assert_eq!(q.source, QualitySource::BluRay);
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
        assert_eq!(source, QualitySource::Web);
    }
}
