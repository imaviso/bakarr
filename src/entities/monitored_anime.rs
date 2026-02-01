use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "monitored_anime")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
    pub romaji_title: String,
    pub english_title: Option<String>,
    pub native_title: Option<String>,
    pub format: String,
    pub episode_count: Option<i32>,
    pub status: String,
    pub current_episode: Option<f32>,
    pub created_at: Option<String>,
    pub quality_profile_id: Option<i32>,
    pub cover_image: Option<String>,
    pub banner_image: Option<String>,
    pub path: Option<String>,
    pub mal_id: Option<i32>,
    pub description: Option<String>,
    pub score: Option<f32>,
    pub genres: Option<String>,
    pub studios: Option<String>,
    pub start_year: Option<i32>,
    pub monitored: bool,
    /// JSON object tracking which provider filled which metadata field.
    /// Example: {"description": "jikan", "score": "kitsu", "genres": "jikan"}
    pub metadata_provenance: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::quality_profiles::Entity",
        from = "Column::QualityProfileId",
        to = "super::quality_profiles::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    QualityProfiles,
    #[sea_orm(has_many = "super::release_history::Entity")]
    ReleaseHistory,
    #[sea_orm(has_many = "super::episode_status::Entity")]
    EpisodeStatus,
    #[sea_orm(has_many = "super::rss_feeds::Entity")]
    RssFeeds,
    #[sea_orm(has_many = "super::episode_metadata::Entity")]
    EpisodeMetadata,
    #[sea_orm(has_one = "super::seadex_cache::Entity")]
    SeadexCache,
    #[sea_orm(has_many = "super::recycle_bin::Entity")]
    RecycleBin,
}

impl Related<super::quality_profiles::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::QualityProfiles.def()
    }
}

impl Related<super::release_profiles::Entity> for Entity {
    fn to() -> RelationDef {
        super::anime_release_profiles::Relation::ReleaseProfile.def()
    }
    fn via() -> Option<RelationDef> {
        Some(
            super::anime_release_profiles::Relation::MonitoredAnime
                .def()
                .rev(),
        )
    }
}

impl Related<super::release_history::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ReleaseHistory.def()
    }
}

impl Related<super::episode_status::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EpisodeStatus.def()
    }
}

impl Related<super::rss_feeds::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RssFeeds.def()
    }
}

impl Related<super::episode_metadata::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EpisodeMetadata.def()
    }
}

impl Related<super::seadex_cache::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SeadexCache.def()
    }
}

impl Related<super::recycle_bin::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RecycleBin.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
