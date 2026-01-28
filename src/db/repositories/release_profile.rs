use crate::entities::{prelude::*, release_profile_rules, release_profiles, anime_release_profiles};
use anyhow::Result;
use sea_orm::{
    ColumnTrait, Condition, DatabaseConnection, EntityTrait, LoaderTrait, QueryFilter, QuerySelect, RelationTrait, Set, TransactionTrait,
};

pub struct ReleaseProfileRepository {
    conn: DatabaseConnection,
}

impl ReleaseProfileRepository {
    #[must_use]
    pub const fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    pub async fn list_profiles(
        &self,
    ) -> Result<Vec<(release_profiles::Model, Vec<release_profile_rules::Model>)>> {
        let profiles = ReleaseProfiles::find().all(&self.conn).await?;
        let rules = profiles.load_many(ReleaseProfileRules, &self.conn).await?;

        Ok(profiles.into_iter().zip(rules.into_iter()).collect())
    }

    pub async fn get_enabled_rules(&self) -> Result<Vec<release_profile_rules::Model>> {
        let rules = ReleaseProfileRules::find()
            .find_also_related(ReleaseProfiles)
            .filter(
                Condition::all()
                    .add(release_profiles::Column::Enabled.eq(true))
                    .add(release_profiles::Column::IsGlobal.eq(true)),
            )
            .all(&self.conn)
            .await?;

        Ok(rules.into_iter().map(|(r, _)| r).collect())
    }

    pub async fn get_rules_for_anime(
        &self,
        anime_id: i32,
    ) -> Result<Vec<release_profile_rules::Model>> {
        let mut rules = self.get_enabled_rules().await?;

        let assigned_profiles: Vec<release_profiles::Model> = ReleaseProfiles::find()
            .join(
                sea_orm::JoinType::InnerJoin,
                anime_release_profiles::Relation::ReleaseProfile.def().rev(),
            )
            .filter(
                Condition::all()
                    .add(release_profiles::Column::Enabled.eq(true))
                    .add(anime_release_profiles::Column::AnimeId.eq(anime_id)),
            )
            .all(&self.conn)
            .await?;

        if !assigned_profiles.is_empty() {
            let assigned_rules = assigned_profiles
                .load_many(ReleaseProfileRules, &self.conn)
                .await?;
            for rule_list in assigned_rules {
                rules.extend(rule_list);
            }
        }

        Ok(rules)
    }

    pub async fn assign_profiles_to_anime(&self, anime_id: i32, profile_ids: &[i32]) -> Result<()> {
        let txn = self.conn.begin().await?;

        AnimeReleaseProfiles::delete_many()
            .filter(anime_release_profiles::Column::AnimeId.eq(anime_id))
            .exec(&txn)
            .await?;

        if !profile_ids.is_empty() {
            let associations: Vec<anime_release_profiles::ActiveModel> = profile_ids
                .iter()
                .map(|&pid| anime_release_profiles::ActiveModel {
                    anime_id: Set(anime_id),
                    profile_id: Set(pid),
                })
                .collect();

            AnimeReleaseProfiles::insert_many(associations)
                .exec(&txn)
                .await?;
        }

        txn.commit().await?;
        Ok(())
    }

    pub async fn get_assigned_profile_ids(&self, anime_id: i32) -> Result<Vec<i32>> {
        let assigned = AnimeReleaseProfiles::find()
            .filter(anime_release_profiles::Column::AnimeId.eq(anime_id))
            .all(&self.conn)
            .await?;

        Ok(assigned.into_iter().map(|a| a.profile_id).collect())
    }

    pub async fn create_profile(
        &self,
        name: String,
        enabled: bool,
        is_global: bool,
        rules: Vec<ReleaseProfileRuleDto>,
    ) -> Result<release_profiles::Model> {
        let txn = self.conn.begin().await?;

        let profile = ReleaseProfiles::insert(release_profiles::ActiveModel {
            name: Set(name),
            enabled: Set(enabled),
            is_global: Set(is_global),
            ..Default::default()
        })
        .exec(&txn)
        .await?;

        let profile_id = profile.last_insert_id;
        let profile_model = ReleaseProfiles::find_by_id(profile_id)
            .one(&txn)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Failed to retrieve created profile"))?;

        if !rules.is_empty() {
            let rule_models: Vec<release_profile_rules::ActiveModel> = rules
                .into_iter()
                .map(|r| release_profile_rules::ActiveModel {
                    profile_id: Set(profile_id),
                    term: Set(r.term),
                    score: Set(r.score),
                    rule_type: Set(r.rule_type),
                    ..Default::default()
                })
                .collect();

            ReleaseProfileRules::insert_many(rule_models)
                .exec(&txn)
                .await?;
        }

        txn.commit().await?;
        Ok(profile_model)
    }

    pub async fn update_profile(
        &self,
        id: i32,
        name: String,
        enabled: bool,
        is_global: bool,
        rules: Vec<ReleaseProfileRuleDto>,
    ) -> Result<()> {
        let txn = self.conn.begin().await?;

        ReleaseProfiles::update(release_profiles::ActiveModel {
            id: Set(id),
            name: Set(name),
            enabled: Set(enabled),
            is_global: Set(is_global),
        })
        .exec(&txn)
        .await?;

        ReleaseProfileRules::delete_many()
            .filter(release_profile_rules::Column::ProfileId.eq(id))
            .exec(&txn)
            .await?;

        if !rules.is_empty() {
            let rule_models: Vec<release_profile_rules::ActiveModel> = rules
                .into_iter()
                .map(|r| release_profile_rules::ActiveModel {
                    profile_id: Set(id),
                    term: Set(r.term),
                    score: Set(r.score),
                    rule_type: Set(r.rule_type),
                    ..Default::default()
                })
                .collect();

            ReleaseProfileRules::insert_many(rule_models)
                .exec(&txn)
                .await?;
        }

        txn.commit().await?;
        Ok(())
    }

    pub async fn delete_profile(&self, id: i32) -> Result<()> {
        ReleaseProfiles::delete_by_id(id).exec(&self.conn).await?;
        Ok(())
    }
}

pub struct ReleaseProfileRuleDto {
    pub term: String,
    pub score: i32,
    pub rule_type: String,
}
