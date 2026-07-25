import type { AppDatabase } from "@/db/database.ts";
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

export const makeAuthUserRepository = (db: AppDatabase) =>
  AuthUserRepository.make(makeAuthUserRepositoryShape(db));

export const makeMediaRepository = (db: AppDatabase) =>
  MediaRepository.make(makeMediaRepositoryShape(db));

export const makeMediaUnitRepository = (db: AppDatabase) =>
  MediaUnitRepository.make(makeMediaUnitRepositoryShape(db));

export const makeAniDbUnitCacheRepository = (db: AppDatabase) =>
  AniDbUnitCacheRepository.make(makeAniDbUnitCacheRepositoryShape(db));

export const makeSeasonalMediaCacheRepository = (db: AppDatabase) =>
  SeasonalMediaCacheRepository.make(makeSeasonalMediaCacheRepositoryShape(db));

export const makeDownloadRepository = (db: AppDatabase) =>
  DownloadRepository.make(makeDownloadRepositoryShape(db));

export const makeOperationsTaskRepository = (db: AppDatabase) =>
  OperationsTaskRepository.make(makeOperationsTaskRepositoryShape(db));

export const makeRssFeedRepository = (db: AppDatabase) =>
  RssFeedRepository.make(makeRssFeedRepositoryShape(db));

export const makeBackgroundJobRepository = (db: AppDatabase) =>
  BackgroundJobRepository.make(makeBackgroundJobRepositoryShape(db));

export const makeSystemLogRepository = (db: AppDatabase) =>
  SystemLogRepository.make(makeSystemLogRepositoryShape(db));

export const makeQualityProfileRepository = (db: AppDatabase) =>
  QualityProfileRepository.make(makeQualityProfileRepositoryShape(db));

export const makeReleaseProfileRepository = (db: AppDatabase) =>
  ReleaseProfileRepository.make(makeReleaseProfileRepositoryShape(db));

export const makeSystemConfigRepository = (db: AppDatabase) =>
  SystemConfigRepository.make(makeSystemConfigRepositoryShape(db));

export const makeSystemStatsRepository = (db: AppDatabase) =>
  SystemStatsRepository.make(makeSystemStatsRepositoryShape(db));

export const makeSystemUnmappedRepository = (db: AppDatabase) =>
  SystemUnmappedRepository.make(makeSystemUnmappedRepositoryShape(db));
