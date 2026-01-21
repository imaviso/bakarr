use crate::config::QualityProfileConfig;
use crate::entities::{prelude::*, quality_definitions, quality_profile_items, quality_profiles};
use crate::quality::{QUALITIES, definition::get_quality_by_name};
use anyhow::Result;
use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
    TransactionTrait,
};
use tracing::info;

/// Repository for quality definitions and profiles
pub struct QualityRepository {
    conn: DatabaseConnection,
}

impl QualityRepository {
    pub fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    // ========================================================================
    // Model Conversion Helpers
    // ========================================================================

    fn map_profile_model(m: quality_profiles::Model) -> QualityProfileRow {
        QualityProfileRow {
            id: m.id,
            name: m.name,
            cutoff_quality_id: m.cutoff_quality_id,
            upgrade_allowed: m.upgrade_allowed,
            seadex_preferred: m.seadex_preferred,
        }
    }

    // ========================================================================
    // Initialization
    // ========================================================================

    pub async fn initialize(&self, config: &crate::config::Config) -> Result<()> {
        // Ensure quality definitions exist
        Self::ensure_definitions_exist(&self.conn).await?;

        // Insert profiles from config
        self.sync_profiles(&config.profiles).await?;

        info!("Quality definitions and profiles initialized");
        Ok(())
    }

    async fn ensure_definitions_exist<C>(conn: &C) -> Result<()>
    where
        C: ConnectionTrait,
    {
        for q in QUALITIES.iter() {
            let active_model = quality_definitions::ActiveModel {
                id: Set(q.id),
                name: Set(q.name.clone()),
                source: Set(q.source.as_str().to_string()),
                resolution: Set(q.resolution as i32),
                rank: Set(q.rank),
            };

            QualityDefinitions::insert(active_model)
                .on_conflict(
                    sea_orm::sea_query::OnConflict::column(quality_definitions::Column::Id)
                        .update_columns([
                            quality_definitions::Column::Name,
                            quality_definitions::Column::Source,
                            quality_definitions::Column::Resolution,
                            quality_definitions::Column::Rank,
                        ])
                        .to_owned(),
                )
                .exec(conn)
                .await?;
        }
        Ok(())
    }

    // ========================================================================
    // Profile Operations
    // ========================================================================

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
        let txn = self.conn.begin().await?;

        // Ensure definitions exist to prevent FK errors
        Self::ensure_definitions_exist(&txn).await?;

        for profile in profiles {
            let cutoff_id = match get_quality_by_name(&profile.cutoff) {
                Some(q) => q.id,
                None => {
                    tracing::warn!(
                        "Unknown cutoff quality '{}' for profile '{}', skipping",
                        profile.cutoff,
                        profile.name
                    );
                    continue;
                }
            };

            let active_model = quality_profiles::ActiveModel {
                name: Set(profile.name.clone()),
                cutoff_quality_id: Set(cutoff_id),
                upgrade_allowed: Set(profile.upgrade_allowed),
                seadex_preferred: Set(profile.seadex_preferred),
                ..Default::default()
            };

            let profile_res = QualityProfiles::insert(active_model)
                .on_conflict(
                    sea_orm::sea_query::OnConflict::column(quality_profiles::Column::Name)
                        .update_columns([
                            quality_profiles::Column::CutoffQualityId,
                            quality_profiles::Column::UpgradeAllowed,
                            quality_profiles::Column::SeadexPreferred,
                        ])
                        .to_owned(),
                )
                .exec(&txn)
                .await?;

            let profile_id = if profile_res.last_insert_id > 0 {
                profile_res.last_insert_id as i32
            } else {
                QualityProfiles::find()
                    .filter(quality_profiles::Column::Name.eq(&profile.name))
                    .one(&txn)
                    .await?
                    .ok_or_else(|| anyhow::anyhow!("Failed to fetch profile"))?
                    .id
            };

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
                        sort_index: Set(index as i32),
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

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone)]
pub struct QualityProfileRow {
    pub id: i32,
    pub name: String,
    pub cutoff_quality_id: i32,
    pub upgrade_allowed: bool,
    pub seadex_preferred: bool,
}
