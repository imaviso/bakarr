use crate::entities::{prelude::*, release_profile_rules, release_profiles};
use anyhow::Result;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, LoaderTrait, QueryFilter, Set, TransactionTrait,
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
            .filter(release_profiles::Column::Enabled.eq(true))
            .all(&self.conn)
            .await?;

        Ok(rules.into_iter().map(|(r, _)| r).collect())
    }

    pub async fn create_profile(
        &self,
        name: String,
        enabled: bool,
        rules: Vec<ReleaseProfileRuleDto>,
    ) -> Result<release_profiles::Model> {
        let txn = self.conn.begin().await?;

        let profile = ReleaseProfiles::insert(release_profiles::ActiveModel {
            name: Set(name),
            enabled: Set(enabled),
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
        rules: Vec<ReleaseProfileRuleDto>,
    ) -> Result<()> {
        let txn = self.conn.begin().await?;

        ReleaseProfiles::update(release_profiles::ActiveModel {
            id: Set(id),
            name: Set(name),
            enabled: Set(enabled),
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
