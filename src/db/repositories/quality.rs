use crate::config::QualityProfileConfig;
use crate::entities::{prelude::*, quality_definitions, quality_profile_items, quality_profiles};
use crate::quality::{QUALITIES, definition::get_quality_by_name};
use anyhow::Result;
use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
    TransactionTrait,
};
use tracing::info;

pub struct QualityRepository {
    conn: DatabaseConnection,
}

impl QualityRepository {
    #[must_use]
    pub const fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    fn map_profile_model(m: quality_profiles::Model) -> QualityProfileRow {
        QualityProfileRow {
            id: m.id,
            name: m.name,
            cutoff_quality_id: m.cutoff_quality_id,
            upgrade_allowed: m.upgrade_allowed,
            seadex_preferred: m.seadex_preferred,
            min_size: m.min_size,
            max_size: m.max_size,
        }
    }

    pub async fn initialize(&self, config: &crate::config::Config) -> Result<()> {
        Self::ensure_definitions_exist(&self.conn).await?;

        self.sync_profiles(&config.profiles).await?;

        info!("Quality definitions and profiles initialized");
        Ok(())
    }

    async fn ensure_definitions_exist<C>(conn: &C) -> Result<()>
    where
        C: ConnectionTrait,
    {
        for q in QUALITIES.iter() {
            let exists = QualityDefinitions::find_by_id(q.id).one(conn).await?;

            let active_model = quality_definitions::ActiveModel {
                id: Set(q.id),
                name: Set(q.name.clone()),
                source: Set(q.source.as_str().to_string()),
                resolution: Set(i32::from(q.resolution)),
                rank: Set(q.rank),
            };

            if exists.is_some() {
                QualityDefinitions::update(active_model)
                    .filter(quality_definitions::Column::Id.eq(q.id))
                    .exec(conn)
                    .await?;
            } else {
                QualityDefinitions::insert(active_model).exec(conn).await?;
            }
        }

        Ok(())
    }

    pub async fn get_profile(&self, id: i32) -> Result<Option<QualityProfileRow>> {
        let row = QualityProfiles::find_by_id(id).one(&self.conn).await?;
        Ok(row.map(Self::map_profile_model))
    }

    pub async fn get_profile_by_name(&self, name: &str) -> Result<Option<QualityProfileRow>> {
        let row = QualityProfiles::find()
            .filter(quality_profiles::Column::Name.eq(name))
            .one(&self.conn)
            .await?;
        Ok(row.map(Self::map_profile_model))
    }

    pub async fn get_allowed_qualities(&self, profile_id: i32) -> Result<Vec<i32>> {
        let rows = QualityProfileItems::find()
            .filter(quality_profile_items::Column::ProfileId.eq(profile_id))
            .filter(quality_profile_items::Column::Allowed.eq(true))
            .order_by_asc(quality_profile_items::Column::SortIndex)
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(|item| item.quality_id).collect())
    }

    pub async fn sync_profiles(&self, profiles: &[QualityProfileConfig]) -> Result<()> {
        Self::ensure_definitions_exist(&self.conn).await?;

        let txn = self.conn.begin().await?;

        for profile in profiles {
            let cutoff_id = if let Some(q) = get_quality_by_name(&profile.cutoff) {
                q.id
            } else {
                tracing::warn!(
                    "Unknown cutoff quality '{}' for profile '{}', skipping",
                    profile.cutoff,
                    profile.name
                );
                continue;
            };

            let active_model = quality_profiles::ActiveModel {
                name: Set(profile.name.clone()),
                cutoff_quality_id: Set(cutoff_id),
                upgrade_allowed: Set(profile.upgrade_allowed),
                seadex_preferred: Set(profile.seadex_preferred),
                min_size: Set(profile
                    .min_size
                    .as_deref()
                    .and_then(crate::parser::size::parse_size)),
                max_size: Set(profile
                    .max_size
                    .as_deref()
                    .and_then(crate::parser::size::parse_size)),
                ..Default::default()
            };

            QualityProfiles::insert(active_model)
                .on_conflict(
                    sea_orm::sea_query::OnConflict::column(quality_profiles::Column::Name)
                        .update_columns([
                            quality_profiles::Column::CutoffQualityId,
                            quality_profiles::Column::UpgradeAllowed,
                            quality_profiles::Column::SeadexPreferred,
                            quality_profiles::Column::MinSize,
                            quality_profiles::Column::MaxSize,
                        ])
                        .to_owned(),
                )
                .exec(&txn)
                .await?;

            let profile_id = QualityProfiles::find()
                .filter(quality_profiles::Column::Name.eq(&profile.name))
                .one(&txn)
                .await?
                .ok_or_else(|| anyhow::anyhow!("Failed to fetch profile '{}'", profile.name))?
                .id;

            QualityProfileItems::delete_many()
                .filter(quality_profile_items::Column::ProfileId.eq(profile_id))
                .exec(&txn)
                .await?;

            for (index, quality_name) in profile.allowed_qualities.iter().enumerate() {
                if let Some(quality) = get_quality_by_name(quality_name) {
                    let item = quality_profile_items::ActiveModel {
                        profile_id: Set(profile_id),
                        quality_id: Set(quality.id),
                        allowed: Set(true),
                        sort_index: Set(i32::try_from(index).unwrap_or(i32::MAX)),
                    };
                    QualityProfileItems::insert(item).exec(&txn).await?;
                } else {
                    tracing::warn!(
                        "Unknown allowed quality '{}' for profile '{}', skipping",
                        quality_name,
                        profile.name
                    );
                }
            }
        }

        txn.commit().await?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct QualityProfileRow {
    pub id: i32,
    pub name: String,
    pub cutoff_quality_id: i32,
    pub upgrade_allowed: bool,
    pub seadex_preferred: bool,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
}
