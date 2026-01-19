use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum QualitySource {
    BluRay,
    Web,
    HDTV,
    DVD,
    SDTV,
    Unknown,
}

impl QualitySource {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::BluRay => "BluRay",
            Self::Web => "WEB",
            Self::HDTV => "HDTV",
            Self::DVD => "DVD",
            Self::SDTV => "SDTV",
            Self::Unknown => "Unknown",
        }
    }

    pub fn rank_bonus(&self) -> i32 {
        match self {
            Self::BluRay => 0,
            Self::Web => 1,
            Self::HDTV => 2,
            Self::DVD => 3,
            Self::SDTV => 4,
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
            name: format!("{} {}p", source, resolution),
            source,
            resolution,
            rank: base_rank + source.rank_bonus(),
        }
    }

    pub fn is_better_than(&self, other: &Quality) -> bool {
        self.rank < other.rank
    }

    pub fn meets_cutoff(&self, cutoff: &Quality) -> bool {
        self.rank <= cutoff.rank
    }

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

lazy_static::lazy_static! {
    pub static ref QUALITY_BLURAY_2160P: Quality = Quality {
        id: 1,
        name: "BluRay 2160p".to_string(),
        source: QualitySource::BluRay,
        resolution: 2160,
        rank: 1,
    };

    pub static ref QUALITY_WEB_2160P: Quality = Quality {
        id: 2,
        name: "WEB 2160p".to_string(),
        source: QualitySource::Web,
        resolution: 2160,
        rank: 2,
    };

    pub static ref QUALITY_BLURAY_1080P: Quality = Quality {
        id: 3,
        name: "BluRay 1080p".to_string(),
        source: QualitySource::BluRay,
        resolution: 1080,
        rank: 3,
    };

    pub static ref QUALITY_WEB_1080P: Quality = Quality {
        id: 4,
        name: "WEB 1080p".to_string(),
        source: QualitySource::Web,
        resolution: 1080,
        rank: 4,
    };

    pub static ref QUALITY_BLURAY_720P: Quality = Quality {
        id: 5,
        name: "BluRay 720p".to_string(),
        source: QualitySource::BluRay,
        resolution: 720,
        rank: 5,
    };

    pub static ref QUALITY_WEB_720P: Quality = Quality {
        id: 6,
        name: "WEB 720p".to_string(),
        source: QualitySource::Web,
        resolution: 720,
        rank: 6,
    };

    pub static ref QUALITY_HDTV_1080P: Quality = Quality {
        id: 7,
        name: "HDTV 1080p".to_string(),
        source: QualitySource::HDTV,
        resolution: 1080,
        rank: 7,
    };

    pub static ref QUALITY_HDTV_720P: Quality = Quality {
        id: 8,
        name: "HDTV 720p".to_string(),
        source: QualitySource::HDTV,
        resolution: 720,
        rank: 8,
    };

    pub static ref QUALITY_DVD: Quality = Quality {
        id: 9,
        name: "DVD 576p".to_string(),
        source: QualitySource::DVD,
        resolution: 576,
        rank: 9,
    };

    pub static ref QUALITY_SDTV: Quality = Quality {
        id: 10,
        name: "SDTV 480p".to_string(),
        source: QualitySource::SDTV,
        resolution: 480,
        rank: 10,
    };

    pub static ref QUALITY_UNKNOWN: Quality = Quality {
        id: 99,
        name: "Unknown".to_string(),
        source: QualitySource::Unknown,
        resolution: 0,
        rank: 99,
    };


    pub static ref QUALITIES: Vec<Quality> = vec![
        QUALITY_BLURAY_2160P.clone(),
        QUALITY_WEB_2160P.clone(),
        QUALITY_BLURAY_1080P.clone(),
        QUALITY_WEB_1080P.clone(),
        QUALITY_BLURAY_720P.clone(),
        QUALITY_WEB_720P.clone(),
        QUALITY_HDTV_1080P.clone(),
        QUALITY_HDTV_720P.clone(),
        QUALITY_DVD.clone(),
        QUALITY_SDTV.clone(),
        QUALITY_UNKNOWN.clone(),
    ];
}

pub fn get_quality_by_id(id: i32) -> Option<Quality> {
    QUALITIES.iter().find(|q| q.id == id).cloned()
}

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
        assert!(QUALITY_BLURAY_1080P.is_better_than(&QUALITY_WEB_1080P));
        assert!(QUALITY_WEB_1080P.is_better_than(&QUALITY_WEB_720P));
        assert!(QUALITY_BLURAY_720P.is_better_than(&QUALITY_HDTV_1080P));
    }

    #[test]
    fn test_quality_cutoff() {
        let cutoff = &*QUALITY_BLURAY_1080P;

        assert!(QUALITY_BLURAY_2160P.meets_cutoff(cutoff));
        assert!(QUALITY_BLURAY_1080P.meets_cutoff(cutoff));
        assert!(!QUALITY_WEB_1080P.meets_cutoff(cutoff));
    }

    #[test]
    fn test_from_source_resolution() {
        let q = Quality::from_source_resolution(QualitySource::Web, 1080);
        assert_eq!(q.id, 4);
        assert_eq!(q.resolution, 1080);
    }

    #[test]
    fn test_get_quality_by_id() {
        let q = get_quality_by_id(3).unwrap();
        assert_eq!(q.name, "BluRay 1080p");
    }
}
