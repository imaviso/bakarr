use crate::models::release::Release;
use regex::{Captures, Regex};
use std::sync::OnceLock;

#[must_use]
pub fn parse_filename(filename: &str) -> Option<Release> {
    parse_standard_bracket(filename)
        .or_else(|| parse_sxxexx_bracket(filename))
        .or_else(|| parse_simple_sxxexx(filename))
        .or_else(|| parse_plex_format(filename))
        .or_else(|| parse_dot_separated(filename))
        .or_else(|| parse_group_at_end(filename))
        .or_else(|| parse_fallback(filename))
}

fn get_regex(re: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex {
    re.get_or_init(|| Regex::new(pattern).expect("Invalid regex pattern defined in code"))
}

fn parse_standard_bracket(filename: &str) -> Option<Release> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(
        &RE,
        r"^\[(?P<group>[^\]]+)\]\s*(?P<title>.+?)\s*-\s*(?P<episode>\d+(?:\.\d+)?)\s*(?:v(?P<version>\d+))?\s*(?:(?:\[(?P<tags>[^\]]*)\])|(?:\((?P<tags_paren>[^)]*)\)))?.*$",
    );

    let caps = re.captures(filename)?;
    extract_common_fields(&caps, filename, true)
}

fn parse_sxxexx_bracket(filename: &str) -> Option<Release> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(
        &RE,
        r"^\[(?P<group>[^\]]+)\]\s*(?P<title>.+?)\s*-?\s*S(?P<season>\d+)E(?P<episode>\d+(?:\.\d+)?)\s*(?:v(?P<version>\d+))?\s*(?:\[(?P<tags>[^\]]*)\])?.*$",
    );

    let caps = re.captures(filename)?;
    extract_common_fields(&caps, filename, true)
}

fn parse_simple_sxxexx(filename: &str) -> Option<Release> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(
        &RE,
        r"^(?P<title>.+?)\s*-\s*S(?P<season>\d+)E(?P<episode>\d+(?:\.\d+)?)(?:\s*-\s*.+)?.*$",
    );

    let caps = re.captures(filename)?;
    let title = caps.name("title")?.as_str().trim();

    if title.ends_with(')')
        && title
            .chars()
            .nth(title.len().saturating_sub(2))
            .is_some_and(char::is_numeric)
    {
        return None;
    }

    let mut release = extract_common_fields(&caps, filename, false)?;
    // Overwrite specific fields that differ from common extraction
    release.resolution = extract_resolution(filename);
    release.source = extract_source(filename);
    release.group = extract_group_from_rest(filename);

    Some(release)
}

fn parse_plex_format(filename: &str) -> Option<Release> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(
        &RE,
        r"^(?P<title>.+?)\s*(?:\(\d{4}\))?\s*-\s*S(?P<season>\d+)E(?P<episode>\d+(?:\.\d+)?)\s*(?:-\s*.+?)?\s*(?:\[(?P<tags>[^\]]*)\])*.*$",
    );

    let caps = re.captures(filename)?;

    let mut release = extract_common_fields(&caps, filename, false)?;
    release.resolution = extract_resolution(filename);
    release.source = extract_source(filename);
    release.group = extract_group_from_rest(filename);

    Some(release)
}

fn parse_dot_separated(filename: &str) -> Option<Release> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(
        &RE,
        r"^(?P<title>.+?)\.S(?P<season>\d+)E(?P<episode>\d+(?:\.\d+)?)\.(?P<rest>.+)$",
    );

    let caps = re.captures(filename)?;

    // Title needs specific handling for dot replacement
    let title_raw = caps.name("title")?.as_str();
    let title_clean = title_raw.replace('.', " ");

    let episode_number = caps.name("episode")?.as_str().parse::<f32>().ok()?;
    let season = caps.name("season").and_then(|m| m.as_str().parse().ok());
    let rest = caps.name("rest").map_or("", |m| m.as_str());

    Some(Release {
        original_filename: filename.to_string(),
        title: clean_title(&title_clean),
        episode_number,
        season,
        group: extract_group_from_rest(rest),
        resolution: extract_resolution(rest),
        source: extract_source(rest),
        version: None,
    })
}

fn parse_group_at_end(filename: &str) -> Option<Release> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(
        &RE,
        r"^(?P<title>.+?)\s*-\s*(?P<episode>\d+(?:\.\d+)?)\s*(?:v(?P<version>\d+))?\s*(?:\((?P<tags>[^)]*)\))?\s*\[(?P<group>[^\]]+)\].*$",
    );

    let caps = re.captures(filename)?;
    extract_common_fields(&caps, filename, true)
}

fn parse_fallback(filename: &str) -> Option<Release> {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    let name = filename.rsplit_once('.').map_or(filename, |(name, _)| name);

    let patterns = PATTERNS.get_or_init(|| {
        vec![
            Regex::new(
                r"-\s*(?P<episode>\d{1,4}(?:\.\d+)?)\s*(?:v(?P<version>\d+))?(?:\s|$|\[|\()",
            )
            .expect("Invalid Regex"),
            Regex::new(
                r"[Ee](?:p(?:isode)?)?\s*(?P<episode>\d{1,4}(?:\.\d+)?)\s*(?:v(?P<version>\d+))?",
            )
            .expect("Invalid Regex"),
            Regex::new(r"[_\s](?P<episode>\d{1,3}(?:\.\d+)?)\s*(?:v(?P<version>\d+))?[_\s\[\(]")
                .expect("Invalid Regex"),
        ]
    });

    for pattern in patterns {
        if let Some(caps) = pattern.captures_iter(name).last() {
            let episode_str = caps.name("episode")?.as_str();
            let episode_number = episode_str.parse::<f32>().ok()?;

            #[allow(clippy::cast_possible_truncation)]
            let ep_int = episode_number as i32;
            if (1990..=2099).contains(&ep_int) || [720, 1080, 2160, 480].contains(&ep_int) {
                continue;
            }

            let version = caps.name("version").and_then(|m| m.as_str().parse().ok());

            let title = extract_title_before_episode(name, episode_str)
                .unwrap_or_else(|| "Unknown".to_string());

            return Some(Release {
                original_filename: filename.to_string(),
                title: clean_title(&title),
                episode_number,
                season: detect_season_from_title(&title),
                group: extract_bracket_group(filename),
                resolution: extract_resolution(filename),
                source: extract_source(filename),
                version,
            });
        }
    }
    None
}

// Helper to consolidate common extraction logic
fn extract_common_fields(
    caps: &Captures,
    filename: &str,
    has_group_in_caps: bool,
) -> Option<Release> {
    let title = caps.name("title")?.as_str().trim().to_string();
    let episode_number = caps.name("episode")?.as_str().parse::<f32>().ok()?;

    let group = if has_group_in_caps {
        caps.name("group").map(|m| m.as_str().trim().to_string())
    } else {
        None
    };

    let season = caps
        .name("season")
        .and_then(|m| m.as_str().parse().ok())
        .or_else(|| detect_season_from_title(&title));

    let version = caps.name("version").and_then(|m| m.as_str().parse().ok());

    let tags = caps
        .name("tags")
        .map(|m| m.as_str())
        .or_else(|| caps.name("tags_paren").map(|m| m.as_str()));

    let resolution = tags.and_then(extract_resolution);
    let source = tags.and_then(extract_source);

    Some(Release {
        original_filename: filename.to_string(),
        title: clean_title(&title),
        episode_number,
        season,
        group,
        resolution,
        source,
        version,
    })
}

fn extract_resolution(s: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(&RE, r"(?i)(4K|2160p|1080p|720p|480p|576p)");

    re.find(s).map(|m| {
        let res = m.as_str();
        if res.eq_ignore_ascii_case("4K") {
            "4K".to_string()
        } else {
            res.to_lowercase()
        }
    })
}

fn extract_source(s: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(
        &RE,
        r"(?i)(BD|Blu-?Ray|WEB-?(?:Rip|DL)?|HDTV|DVDRip|BDRip|WEBRip|AMZN|CR|DSNP|NF|HMAX)",
    );

    re.find(s).map(|m| {
        let src = m.as_str();
        if src.eq_ignore_ascii_case("BluRay") || src.eq_ignore_ascii_case("Blu-Ray") {
            "BD".to_string()
        } else if src.eq_ignore_ascii_case("WEBRip") || src.eq_ignore_ascii_case("WEB-Rip") {
            "WEBRIP".to_string()
        } else if src.eq_ignore_ascii_case("WEBDL")
            || src.eq_ignore_ascii_case("WEB-DL")
            || src.eq_ignore_ascii_case("WEB")
        {
            "WEB".to_string()
        } else {
            src.to_string()
        }
    })
}

fn extract_bracket_group(s: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = get_regex(&RE, r"^\[([^\]]+)\]");

    re.captures(s)
        .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
}

fn extract_group_from_rest(s: &str) -> Option<String> {
    if let Some(pos) = s.rfind('-') {
        let rest = &s[pos + 1..].trim();
        let path = std::path::Path::new(rest);
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(rest);

        if stem.contains('[') && stem.contains(']') {
            static RE_BRACKETS: OnceLock<Regex> = OnceLock::new();
            let re = get_regex(&RE_BRACKETS, r"\[([^\]]+)\]");

            let matches: Vec<_> = re
                .captures_iter(stem)
                .filter_map(|c| c.get(1).map(|m| m.as_str().trim()))
                .collect();

            for val in matches.iter().rev() {
                let clean_val = val.trim_start_matches('[');
                if !is_metadata(clean_val) {
                    return Some(clean_val.to_string());
                }
            }
        }

        if !stem.is_empty() && !stem.starts_with('[') && !is_metadata(stem) {
            return Some(stem.to_string());
        }
    }
    None
}

fn is_metadata(s: &str) -> bool {
    if extract_resolution(s).is_some() {
        return true;
    }
    if extract_source(s).is_some() {
        return true;
    }
    let upper = s.to_uppercase();
    [
        "X264", "X265", "HEVC", "AV1", "AAC", "FLAC", "AC3", "EAC3", "DTS", "TRUEHD", "OPUS",
        "H.264", "H.265", "10BIT", "HDR", "REMUX", "DV",
    ]
    .contains(&upper.as_str())
}

fn extract_title_before_episode(filename: &str, episode_str: &str) -> Option<String> {
    let pos = filename.find(episode_str)?;
    let before = &filename[..pos];

    let title = before.trim_end_matches(|c: char| c == '-' || c == '_' || c.is_whitespace());

    let title = if title.starts_with('[') {
        title.find(']').map_or(title, |end| title[end + 1..].trim())
    } else {
        title
    };

    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

pub fn detect_season_from_title(title: &str) -> Option<i32> {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    let patterns = PATTERNS.get_or_init(|| {
        vec![
            Regex::new(r"(?i)\b(?:Season|S)\s*(\d+)\b").expect("Invalid Regex"),
            Regex::new(r"(?i)\b(\d+)(?:st|nd|rd|th)\s+Season\b").expect("Invalid Regex"),
            Regex::new(r"(?i)\bPart\s+(\d+|I{1,3}V?|VI{0,3})\b").expect("Invalid Regex"),
            Regex::new(r"(?i)\bCour\s+(\d+)\b").expect("Invalid Regex"),
            Regex::new(r"\b(I{2,3}V?|VI{0,3})\s*$").expect("Invalid Regex"),
        ]
    });

    for pattern in patterns {
        if let Some(caps) = pattern.captures(title)
            && let Some(m) = caps.get(1)
        {
            let num_str = m.as_str();

            if let Ok(n) = num_str.parse::<i32>() {
                return Some(n);
            }

            if let Some(n) = roman_to_int(num_str) {
                return Some(n);
            }
        }
    }

    None
}

fn roman_to_int(s: &str) -> Option<i32> {
    let s = s.to_uppercase();
    match s.as_str() {
        "I" => Some(1),
        "II" => Some(2),
        "III" => Some(3),
        "IV" => Some(4),
        "V" => Some(5),
        "VI" => Some(6),
        "VII" => Some(7),
        "VIII" => Some(8),
        "IX" => Some(9),
        "X" => Some(10),
        _ => None,
    }
}

#[must_use]
pub fn clean_title(title: &str) -> String {
    let mut title = title.trim().trim_end_matches(['-', '_']).trim();

    if let Some(idx) = title.rfind('(')
        && let Some(end) = title.rfind(')')
        && end > idx
    {
        let inside = &title[idx + 1..end];
        if inside.len() == 4 && inside.chars().all(|c| c.is_ascii_digit()) {
            title = title[..idx].trim();
        }
    }

    let mut result = String::with_capacity(title.len());
    let mut last_was_space = true;
    for c in title.chars() {
        let is_sep = c.is_whitespace() || c == '_';
        if is_sep {
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
        } else {
            result.push(c);
            last_was_space = false;
        }
    }

    if result.ends_with(' ') {
        result.pop();
    }

    result
}

pub fn normalize_title(title: &str) -> String {
    static NORMALIZE_PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();

    let title = clean_title(title);

    let patterns = NORMALIZE_PATTERNS.get_or_init(|| {
        vec![
            Regex::new(r"(?i)\s*\d+(?:st|nd|rd|th)\s+Season\s*$").expect("Invalid Regex"),
            Regex::new(r"(?i)\s*(?:Season|S)\s*\d+\s*$").expect("Invalid Regex"),
            Regex::new(r"(?i)\s*Part\s+(?:\d+|I{1,3}V?|VI{0,3})\s*$").expect("Invalid Regex"),
            Regex::new(r"(?i)\s*Cour\s+\d+\s*$").expect("Invalid Regex"),
            Regex::new(r"\s+(?:I{2,3}V?|VI{0,3})\s*$").expect("Invalid Regex"),
            Regex::new(r"\s*\(\d{4}\)\s*$").expect("Invalid Regex"),
            Regex::new(r"\s*[:–—-]\s*$").expect("Invalid Regex"),
        ]
    });

    let mut result = title;
    for pattern in patterns {
        result = pattern.replace_all(&result, "").to_string();
    }

    let mut cleaned = String::with_capacity(result.len());
    let mut last_was_space = false;
    for c in result.chars() {
        if c.is_whitespace() {
            if !last_was_space {
                cleaned.push(' ');
                last_was_space = true;
            }
        } else {
            cleaned.push(c);
            last_was_space = false;
        }
    }

    cleaned.trim().to_string()
}

#[must_use]
pub fn normalize_for_matching(title: &str) -> String {
    normalize_title(title)
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_standard_format() {
        let r = parse_filename("[SubsPlease] Frieren - 01 [1080p].mkv").unwrap();
        assert_eq!(r.title, "Frieren");
        assert!((r.episode_number - 1.0).abs() < f32::EPSILON);
        assert_eq!(r.group.as_deref(), Some("SubsPlease"));
        assert_eq!(r.resolution.as_deref(), Some("1080p"));
        assert_eq!(r.season, None);
    }

    #[test]
    fn test_standard_with_version() {
        let r = parse_filename("[Erai-raws] Oshi no Ko - 05v2 [1080p].mkv").unwrap();
        assert_eq!(r.title, "Oshi no Ko");
        assert!((r.episode_number - 5.0).abs() < f32::EPSILON);
        assert_eq!(r.version, Some(2));
        assert!(r.is_revised());
    }

    #[test]
    fn test_decimal_episode() {
        let r = parse_filename("[Group] Anime - 6.5 [1080p].mkv").unwrap();
        assert!((r.episode_number - 6.5).abs() < f32::EPSILON);
    }

    #[test]
    fn test_sxxexx_format() {
        let r = parse_filename("[Group] My Hero Academia - S05E10 [1080p].mkv").unwrap();
        assert_eq!(r.title, "My Hero Academia");
        assert_eq!(r.season, Some(5));
        assert!((r.episode_number - 10.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_dot_separated() {
        let r = parse_filename("Attack.on.Titan.S04E28.1080p.WEB.x264-SENPAI.mkv").unwrap();
        assert_eq!(r.title, "Attack on Titan");
        assert_eq!(r.season, Some(4));
        assert!((r.episode_number - 28.0).abs() < f32::EPSILON);
        assert_eq!(r.resolution.as_deref(), Some("1080p"));
        assert_eq!(r.source.as_deref(), Some("WEB"));
        assert_eq!(r.group.as_deref(), Some("SENPAI"));
    }

    #[test]
    fn test_group_at_end() {
        let r = parse_filename("Demon Slayer - 05 (1080p BD) [Cool-Group].mkv").unwrap();
        assert_eq!(r.title, "Demon Slayer");
        assert!((r.episode_number - 5.0).abs() < f32::EPSILON);
        assert_eq!(r.group.as_deref(), Some("Cool-Group"));
        assert_eq!(r.resolution.as_deref(), Some("1080p"));
        assert_eq!(r.source.as_deref(), Some("BD"));
    }

    #[test]
    fn test_season_in_title() {
        let r = parse_filename("[Group] Mob Psycho 100 Season 2 - 08 [1080p].mkv").unwrap();
        assert_eq!(r.season, Some(2));
        assert!((r.episode_number - 8.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_season_2nd_format() {
        let r = parse_filename("[Group] Title 2nd Season - 05 [1080p].mkv").unwrap();
        assert_eq!(r.season, Some(2));
    }

    #[test]
    fn test_roman_numeral_season() {
        let r = parse_filename("[Group] Re Zero II - 10 [1080p].mkv").unwrap();
        assert_eq!(r.season, Some(2));
    }

    #[test]
    fn test_part_format() {
        let r = parse_filename("[Group] Attack on Titan Part 2 - 05 [1080p].mkv").unwrap();
        assert_eq!(r.season, Some(2));
    }

    #[test]
    fn test_extract_resolution() {
        assert_eq!(extract_resolution("1080p HEVC"), Some("1080p".to_string()));
        assert_eq!(extract_resolution("4K HDR"), Some("4K".to_string()));
        assert_eq!(extract_resolution("720P web"), Some("720p".to_string()));
    }

    #[test]
    fn test_extract_source() {
        assert_eq!(extract_source("1080p BD x265"), Some("BD".to_string()));
        assert_eq!(extract_source("WEBRip 720p"), Some("WEBRIP".to_string()));
        assert_eq!(extract_source("BluRay"), Some("BD".to_string()));
    }

    #[test]
    fn test_fallback_parser() {
        let r = parse_filename("Some Anime - 15.mkv").unwrap();
        assert!((r.episode_number - 15.0).abs() < f32::EPSILON);
        assert_eq!(r.title, "Some Anime");

        let r2 = parse_filename("Anime Title E05.mkv").unwrap();
        assert!((r2.episode_number - 5.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_underscores() {
        let r = parse_filename("[Group]_Anime_Title_-_05_[1080p].mkv").unwrap();
        assert_eq!(r.title, "Anime Title");
        assert!((r.episode_number - 5.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_bd_source_variations() {
        assert_eq!(extract_source("BD 1080p"), Some("BD".to_string()));
        assert_eq!(extract_source("Blu-Ray"), Some("BD".to_string()));
        assert_eq!(extract_source("BluRay"), Some("BD".to_string()));
    }

    #[test]
    fn test_detect_season_from_title() {
        assert_eq!(detect_season_from_title("Title Season 3"), Some(3));
        assert_eq!(detect_season_from_title("Title S2"), Some(2));
        assert_eq!(detect_season_from_title("Title 2nd Season"), Some(2));
        assert_eq!(detect_season_from_title("Title Part 2"), Some(2));
        assert_eq!(detect_season_from_title("Title Part II"), Some(2));
        assert_eq!(detect_season_from_title("Title III"), Some(3));
        assert_eq!(detect_season_from_title("Title Cour 2"), Some(2));
        assert_eq!(detect_season_from_title("Just a Title"), None);
    }

    #[test]
    fn test_normalize_title() {
        assert_eq!(normalize_title("Oshi no Ko 2nd Season"), "Oshi no Ko");
        assert_eq!(
            normalize_title("My Hero Academia Season 5"),
            "My Hero Academia"
        );
        assert_eq!(normalize_title("Re:Zero Part 2"), "Re:Zero");
        assert_eq!(normalize_title("Title S2"), "Title");
        assert_eq!(normalize_title("Demon Slayer (2019)"), "Demon Slayer");
        assert_eq!(normalize_title("Attack on Titan III"), "Attack on Titan");
        assert_eq!(normalize_title("Call of the Night"), "Call of the Night");
    }

    #[test]
    fn test_normalize_for_matching() {
        assert_eq!(
            normalize_for_matching("Oshi no Ko 2nd Season"),
            "oshi no ko"
        );
        assert_eq!(
            normalize_for_matching("My Hero Academia!"),
            "my hero academia"
        );
        assert_eq!(normalize_for_matching("Re:Zero"), "rezero");
    }

    #[test]
    fn test_plex_format() {
        let r = parse_filename(
            "The Apothecary Diaries (2023) - S01E01 - Maomao [Bluray-1080p][Opus 2.0][x265]-MTBB.mkv",
        )
        .unwrap();
        assert_eq!(r.title, "The Apothecary Diaries");
        assert_eq!(r.season, Some(1));
        assert!((r.episode_number - 1.0).abs() < f32::EPSILON);
        assert_eq!(r.resolution.as_deref(), Some("1080p"));
        assert_eq!(r.source.as_deref(), Some("BD"));
        assert_eq!(r.group.as_deref(), Some("MTBB"));

        let r2 = parse_filename(
            "The Apothecary Diaries (2023) - S02E05 - The Moon Fairy [WEBDL-1080p][AAC 2.0][x264]-VARYG.mkv",
        )
        .unwrap();
        assert_eq!(r2.season, Some(2));
        assert!((r2.episode_number - 5.0).abs() < f32::EPSILON);
        assert_eq!(r2.source.as_deref(), Some("WEB"));
    }

    #[test]
    fn test_extract_group_complex_from_issue() {
        let filename = "Chitose.Is.in.the.Ramune.Bottle.S01E01.The.Hazy.Spring.Moon.Above.1080p.CR.WEB-DL.AAC2.0.H.264-VARYG.mkv";
        let r = parse_filename(filename).unwrap();
        assert_eq!(r.group.as_deref(), Some("VARYG"));
    }
}
