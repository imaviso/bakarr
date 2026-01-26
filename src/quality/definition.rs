use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum QualitySource {
    BluRayRemux,
    BluRay,
    WebDl,
    WebRip,
    HDTV,
    DVD,
    SDTV,
    Unknown,
}

impl QualitySource {
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::BluRayRemux => "Remux",
            Self::BluRay => "BluRay",
            Self::WebDl => "WEB-DL",
            Self::WebRip => "WEBRip",
            Self::HDTV => "HDTV",
            Self::DVD => "DVD",
            Self::SDTV => "SDTV",
            Self::Unknown => "Unknown",
        }
    }

    #[must_use]
    pub const fn rank_bonus(&self) -> i32 {
        match self {
            Self::BluRayRemux => -1,
            Self::BluRay => 0,
            Self::WebDl => 1,
            Self::WebRip => 2,
            Self::HDTV => 3,
            Self::DVD => 4,
            Self::SDTV => 5,
            Self::Unknown => 10,
        }
    }
}

impl std::fmt::Display for QualitySource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quality {
    pub id: i32,

    pub name: String,

    pub source: QualitySource,

    pub resolution: u16,

    pub rank: i32,
}

impl Quality {
    #[must_use]
    pub const fn new(
        id: i32,
        _name: &'static str,
        source: QualitySource,
        resolution: u16,
        rank: i32,
    ) -> Self {
        Self {
            id,
            name: String::new(),
            source,
            resolution,
            rank,
        }
    }

    #[must_use]
    pub fn from_source_resolution(source: QualitySource, resolution: u16) -> Self {
        for q in QUALITIES.iter() {
            if q.source == source && q.resolution == resolution {
                return q.clone();
            }
        }

        let base_rank = match resolution {
            2160 => 2,
            1080 => 4,
            720 => 6,
            576 => 9,
            480 => 10,
            _ => 50,
        };

        Self {
            id: 99,
            name: format!("{source} {resolution}p"),
            source,
            resolution,
            rank: base_rank + source.rank_bonus(),
        }
    }

    #[must_use]
    pub const fn is_better_than(&self, other: &Self) -> bool {
        self.rank < other.rank
    }

    #[must_use]
    pub const fn meets_cutoff(&self, cutoff: &Self) -> bool {
        self.rank <= cutoff.rank
    }

    #[must_use]
    pub fn unknown() -> Self {
        QUALITY_UNKNOWN.clone()
    }
}

impl Default for Quality {
    fn default() -> Self {
        Self::unknown()
    }
}

impl std::fmt::Display for Quality {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}p", self.source, self.resolution)
    }
}

use std::sync::LazyLock;

pub static QUALITY_BLURAY_2160P_REMUX: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 11,
    name: "BluRay 2160p Remux".to_string(),
    source: QualitySource::BluRayRemux,
    resolution: 2160,
    rank: 1,
});

pub static QUALITY_BLURAY_2160P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 1,
    name: "BluRay 2160p".to_string(),
    source: QualitySource::BluRay,
    resolution: 2160,
    rank: 2,
});

pub static QUALITY_WEB_DL_2160P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 2,
    name: "WEB-DL 2160p".to_string(),
    source: QualitySource::WebDl,
    resolution: 2160,
    rank: 3,
});

pub static QUALITY_WEB_RIP_2160P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 13,
    name: "WEBRip 2160p".to_string(),
    source: QualitySource::WebRip,
    resolution: 2160,
    rank: 4,
});

pub static QUALITY_BLURAY_1080P_REMUX: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 12,
    name: "BluRay 1080p Remux".to_string(),
    source: QualitySource::BluRayRemux,
    resolution: 1080,
    rank: 5,
});

pub static QUALITY_BLURAY_1080P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 3,
    name: "BluRay 1080p".to_string(),
    source: QualitySource::BluRay,
    resolution: 1080,
    rank: 6,
});

pub static QUALITY_WEB_DL_1080P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 4,
    name: "WEB-DL 1080p".to_string(),
    source: QualitySource::WebDl,
    resolution: 1080,
    rank: 7,
});

pub static QUALITY_WEB_RIP_1080P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 14,
    name: "WEBRip 1080p".to_string(),
    source: QualitySource::WebRip,
    resolution: 1080,
    rank: 8,
});

pub static QUALITY_BLURAY_720P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 5,
    name: "BluRay 720p".to_string(),
    source: QualitySource::BluRay,
    resolution: 720,
    rank: 9,
});

pub static QUALITY_WEB_DL_720P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 6,
    name: "WEB-DL 720p".to_string(),
    source: QualitySource::WebDl,
    resolution: 720,
    rank: 10,
});

pub static QUALITY_WEB_RIP_720P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 15,
    name: "WEBRip 720p".to_string(),
    source: QualitySource::WebRip,
    resolution: 720,
    rank: 11,
});

pub static QUALITY_HDTV_1080P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 7,
    name: "HDTV 1080p".to_string(),
    source: QualitySource::HDTV,
    resolution: 1080,
    rank: 12,
});

pub static QUALITY_HDTV_720P: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 8,
    name: "HDTV 720p".to_string(),
    source: QualitySource::HDTV,
    resolution: 720,
    rank: 13,
});

pub static QUALITY_DVD: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 9,
    name: "DVD 576p".to_string(),
    source: QualitySource::DVD,
    resolution: 576,
    rank: 14,
});

pub static QUALITY_SDTV: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 10,
    name: "SDTV 480p".to_string(),
    source: QualitySource::SDTV,
    resolution: 480,
    rank: 15,
});

pub static QUALITY_UNKNOWN: LazyLock<Quality> = LazyLock::new(|| Quality {
    id: 99,
    name: "Unknown".to_string(),
    source: QualitySource::Unknown,
    resolution: 0,
    rank: 99,
});

pub static QUALITIES: LazyLock<Vec<Quality>> = LazyLock::new(|| {
    vec![
        QUALITY_BLURAY_2160P_REMUX.clone(),
        QUALITY_BLURAY_2160P.clone(),
        QUALITY_WEB_DL_2160P.clone(),
        QUALITY_WEB_RIP_2160P.clone(),
        QUALITY_BLURAY_1080P_REMUX.clone(),
        QUALITY_BLURAY_1080P.clone(),
        QUALITY_WEB_DL_1080P.clone(),
        QUALITY_WEB_RIP_1080P.clone(),
        QUALITY_BLURAY_720P.clone(),
        QUALITY_WEB_DL_720P.clone(),
        QUALITY_WEB_RIP_720P.clone(),
        QUALITY_HDTV_1080P.clone(),
        QUALITY_HDTV_720P.clone(),
        QUALITY_DVD.clone(),
        QUALITY_SDTV.clone(),
        QUALITY_UNKNOWN.clone(),
    ]
});

#[must_use]
pub fn get_quality_by_id(id: i32) -> Option<Quality> {
    QUALITIES.iter().find(|q| q.id == id).cloned()
}

#[must_use]
pub fn get_quality_by_name(name: &str) -> Option<Quality> {
    QUALITIES
        .iter()
        .find(|q| q.name.eq_ignore_ascii_case(name))
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quality_ranking() {
        assert!(QUALITY_BLURAY_1080P.is_better_than(&QUALITY_WEB_DL_1080P));
        assert!(QUALITY_WEB_DL_1080P.is_better_than(&QUALITY_WEB_DL_720P));
        assert!(QUALITY_BLURAY_720P.is_better_than(&QUALITY_HDTV_1080P));
        assert!(QUALITY_BLURAY_1080P_REMUX.is_better_than(&QUALITY_BLURAY_1080P));
    }

    #[test]
    fn test_quality_cutoff() {
        let cutoff = &*QUALITY_BLURAY_1080P;

        assert!(QUALITY_BLURAY_2160P.meets_cutoff(cutoff));
        assert!(QUALITY_BLURAY_1080P.meets_cutoff(cutoff));
        assert!(!QUALITY_WEB_DL_1080P.meets_cutoff(cutoff));
    }

    #[test]
    fn test_from_source_resolution() {
        let q = Quality::from_source_resolution(QualitySource::WebDl, 1080);
        assert_eq!(q.id, 4);
        assert_eq!(q.resolution, 1080);
    }

    #[test]
    fn test_get_quality_by_id() {
        let q = get_quality_by_id(3).unwrap();
        assert_eq!(q.name, "BluRay 1080p");
    }
}
