use crate::entities::{blocklist, prelude::*, recycle_bin, release_history};
use anyhow::Result;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, FromQueryResult, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set,
};

pub struct DownloadRepository {
    conn: DatabaseConnection,
}

impl DownloadRepository {
    #[must_use]
    pub const fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    fn map_release_model(r: release_history::Model) -> DownloadEntry {
        DownloadEntry {
            id: i64::from(r.id),
            anime_id: r.anime_id,
            filename: r.filename,
            episode_number: r.episode_number,
            group_name: r.group_name,
            download_date: r.download_date.unwrap_or_default(),
            info_hash: r.info_hash,
            imported: r.imported,
        }
    }

    pub async fn record(
        &self,
        anime_id: i32,
        filename: &str,
        episode: f32,
        group: Option<&str>,
        info_hash: Option<&str>,
    ) -> Result<()> {
        let active_model = release_history::ActiveModel {
            anime_id: Set(anime_id),
            filename: Set(filename.to_string()),
            episode_number: Set(episode),
            group_name: Set(group.map(std::string::ToString::to_string)),
            info_hash: Set(info_hash.map(std::string::ToString::to_string)),
            download_date: Set(Some(chrono::Utc::now().to_rfc3339())),
            imported: Set(false),
            ..Default::default()
        };

        ReleaseHistory::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(release_history::Column::Filename)
                    .do_nothing()
                    .to_owned(),
            )
            .exec_without_returning(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn set_imported(&self, download_id: i64, imported: bool) -> Result<()> {
        ReleaseHistory::update_many()
            .col_expr(
                release_history::Column::Imported,
                sea_orm::sea_query::Expr::value(imported),
            )
            .filter(release_history::Column::Id.eq(i32::try_from(download_id).unwrap_or(i32::MAX)))
            .exec(&self.conn)
            .await?;
        Ok(())
    }

    pub async fn get_by_hash(&self, hash: &str) -> Result<Option<DownloadEntry>> {
        let result = ReleaseHistory::find()
            .filter(release_history::Column::InfoHash.eq(hash))
            .one(&self.conn)
            .await?;

        Ok(result.map(Self::map_release_model))
    }

    pub async fn get_by_hashes(&self, hashes: &[String]) -> Result<Vec<DownloadEntry>> {
        if hashes.is_empty() {
            return Ok(Vec::new());
        }

        let rows = ReleaseHistory::find()
            .filter(release_history::Column::InfoHash.is_in(hashes))
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(Self::map_release_model).collect())
    }

    pub async fn is_downloaded(&self, filename: &str) -> Result<bool> {
        let count = ReleaseHistory::find()
            .filter(release_history::Column::Filename.eq(filename))
            .count(&self.conn)
            .await?;

        Ok(count > 0)
    }

    pub async fn get_for_anime(&self, anime_id: i32) -> Result<Vec<DownloadEntry>> {
        let rows = ReleaseHistory::find()
            .filter(release_history::Column::AnimeId.eq(anime_id))
            .order_by_asc(release_history::Column::EpisodeNumber)
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(Self::map_release_model).collect())
    }

    pub async fn episode_count(&self, anime_id: i32) -> Result<i32> {
        let count = ReleaseHistory::find()
            .filter(release_history::Column::AnimeId.eq(anime_id))
            .select_only()
            .column(release_history::Column::EpisodeNumber)
            .distinct()
            .count(&self.conn)
            .await?;

        Ok(i32::try_from(count).unwrap_or(i32::MAX))
    }

    pub async fn recent(&self, limit: i32) -> Result<Vec<DownloadEntry>> {
        let rows = ReleaseHistory::find()
            .order_by_desc(release_history::Column::DownloadDate)
            .limit(u64::try_from(limit).unwrap_or(u64::MAX))
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(Self::map_release_model).collect())
    }

    pub async fn add_to_blocklist(&self, info_hash: &str, reason: &str) -> Result<()> {
        let active_model = blocklist::ActiveModel {
            info_hash: Set(info_hash.to_string()),
            reason: Set(reason.to_string()),
            created_at: Set(Some(chrono::Utc::now().to_rfc3339())),
            ..Default::default()
        };

        Blocklist::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(blocklist::Column::InfoHash)
                    .do_nothing()
                    .to_owned(),
            )
            .exec_without_returning(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn is_blocked(&self, info_hash: &str) -> Result<bool> {
        let count = Blocklist::find()
            .filter(blocklist::Column::InfoHash.eq(info_hash))
            .count(&self.conn)
            .await?;

        Ok(count > 0)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn add_to_recycle_bin(
        &self,
        original_path: &str,
        recycled_path: Option<&str>,
        anime_id: i32,
        episode_number: i32,
        quality_id: Option<i32>,
        file_size: Option<i64>,
        reason: &str,
    ) -> Result<i64> {
        let active_model = recycle_bin::ActiveModel {
            original_path: Set(original_path.to_string()),
            recycled_path: Set(recycled_path.map(std::string::ToString::to_string)),
            anime_id: Set(anime_id),
            episode_number: Set(episode_number),
            quality_id: Set(quality_id),
            file_size: Set(file_size),
            reason: Set(reason.to_string()),
            deleted_at: Set(chrono::Utc::now().to_rfc3339()),
            ..Default::default()
        };

        let result = RecycleBin::insert(active_model).exec(&self.conn).await?;
        Ok(i64::from(result.last_insert_id))
    }

    pub async fn get_old_recycle_entries(&self, older_than: &str) -> Result<Vec<RecycleBinEntry>> {
        let rows = RecycleBin::find()
            .filter(recycle_bin::Column::DeletedAt.lt(older_than))
            .into_model::<RecycleBinEntry>()
            .all(&self.conn)
            .await?;

        Ok(rows)
    }

    pub async fn remove_from_recycle_bin(&self, id: i64) -> Result<()> {
        RecycleBin::delete_by_id(i32::try_from(id).unwrap_or(i32::MAX))
            .exec(&self.conn)
            .await?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct DownloadEntry {
    pub id: i64,
    pub anime_id: i32,
    pub filename: String,
    pub episode_number: f32,
    pub group_name: Option<String>,
    pub download_date: String,
    pub info_hash: Option<String>,
    pub imported: bool,
}

#[derive(Debug, Clone, FromQueryResult)]
pub struct RecycleBinEntry {
    pub id: i64,
    pub original_path: String,
    pub recycled_path: Option<String>,
    pub anime_id: i32,
    pub episode_number: i32,
    pub quality_id: Option<i32>,
    pub file_size: Option<i64>,
    pub deleted_at: String,
    pub reason: String,
}
