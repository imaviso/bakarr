import type { AppDatabase } from "@/db/database.ts";
import type * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { AuthUserRepository } from "@/features/auth/user-repository.ts";
import { makeAuthUserRepositoryShape } from "@/features/auth/user-repository.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { makeMediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import { makeAniDbUnitCacheRepositoryShape } from "@/features/media/units/anidb-unit-cache-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { makeMediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import { SeasonalMediaCacheRepository } from "@/features/media/query/seasonal-media-cache-repository.ts";
import { makeSeasonalMediaCacheRepositoryShape } from "@/features/media/query/seasonal-media-cache-repository.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { makeDownloadRepositoryShape } from "@/features/operations/repository/download-repository.ts";
import { OperationsTaskRepository } from "@/features/operations/repository/task-repository.ts";
import { makeOperationsTaskRepositoryShape } from "@/features/operations/repository/task-repository.ts";
import { RssFeedRepository } from "@/features/operations/repository/rss-feed-repository.ts";
import { makeRssFeedRepositoryShape } from "@/features/operations/repository/rss-feed-repository.ts";
import { BackgroundJobRepository } from "@/features/system/repository/background-job-repository.ts";
import { makeBackgroundJobRepositoryShape } from "@/features/system/repository/background-job-repository.ts";
import { BackgroundJobRunner } from "@/background/background-job-runner.ts";
import { makeBackgroundJobRunnerShape } from "@/background/background-job-runner.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { makeSystemLogRepositoryShape } from "@/features/system/repository/log-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { makeQualityProfileRepositoryShape } from "@/features/system/repository/quality-profile-repository.ts";
import { ReleaseProfileRepository } from "@/features/system/repository/release-profile-repository.ts";
import { makeReleaseProfileRepositoryShape } from "@/features/system/repository/release-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { makeSystemConfigRepositoryShape } from "@/features/system/repository/system-config-repository.ts";
import { SystemStatsRepository } from "@/features/system/repository/stats-repository.ts";
import { makeSystemStatsRepositoryShape } from "@/features/system/repository/stats-repository.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";
import { makeSystemUnmappedRepositoryShape } from "@/features/system/repository/unmapped-repository.ts";

export const makeAuthUserRepository = (db: AppDatabase, sqlClient: NodeSqliteClient.SqliteClient) =>
  AuthUserRepository.of(makeAuthUserRepositoryShape(db, sqlClient));

export const makeMediaRepository = (db: AppDatabase, sqlClient: NodeSqliteClient.SqliteClient) =>
  MediaRepository.of(makeMediaRepositoryShape(db, sqlClient));

export const makeMediaUnitRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => MediaUnitRepository.of(makeMediaUnitRepositoryShape(db, sqlClient));

export const makeAniDbUnitCacheRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => AniDbUnitCacheRepository.of(makeAniDbUnitCacheRepositoryShape(db, sqlClient));

export const makeSeasonalMediaCacheRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => SeasonalMediaCacheRepository.of(makeSeasonalMediaCacheRepositoryShape(db, sqlClient));

export const makeDownloadRepository = (db: AppDatabase, sqlClient: NodeSqliteClient.SqliteClient) =>
  DownloadRepository.of(makeDownloadRepositoryShape(db, sqlClient));

export const makeOperationsTaskRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => OperationsTaskRepository.of(makeOperationsTaskRepositoryShape(db, sqlClient));

export const makeRssFeedRepository = (db: AppDatabase, sqlClient: NodeSqliteClient.SqliteClient) =>
  RssFeedRepository.of(makeRssFeedRepositoryShape(db, sqlClient));

export const makeBackgroundJobRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => BackgroundJobRepository.of(makeBackgroundJobRepositoryShape(db, sqlClient));

export const makeBackgroundJobRunner = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) =>
  BackgroundJobRunner.of(
    makeBackgroundJobRunnerShape(makeBackgroundJobRepositoryShape(db, sqlClient)),
  );

export const makeSystemLogRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => SystemLogRepository.of(makeSystemLogRepositoryShape(db, sqlClient));

export const makeQualityProfileRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => QualityProfileRepository.of(makeQualityProfileRepositoryShape(db, sqlClient));

export const makeReleaseProfileRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => ReleaseProfileRepository.of(makeReleaseProfileRepositoryShape(db, sqlClient));

export const makeSystemConfigRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => SystemConfigRepository.of(makeSystemConfigRepositoryShape(db, sqlClient));

export const makeSystemStatsRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => SystemStatsRepository.of(makeSystemStatsRepositoryShape(db, sqlClient));

export const makeSystemUnmappedRepository = (
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
) => SystemUnmappedRepository.of(makeSystemUnmappedRepositoryShape(db, sqlClient));
