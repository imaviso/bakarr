import { Layer } from "effect";

import { DatabaseSqlClientLive } from "@/db/database.ts";
import { AuthUserRepository } from "@/features/auth/user-repository.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import { SeasonalMediaCacheRepository } from "@/features/media/query/seasonal-media-cache-repository.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { OperationsTaskRepository } from "@/features/operations/repository/task-repository.ts";
import { RssFeedRepository } from "@/features/operations/repository/rss-feed-repository.ts";
import { BackgroundJobRepository } from "@/features/system/repository/background-job-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { ReleaseProfileRepository } from "@/features/system/repository/release-profile-repository.ts";
import { SystemStatsRepository } from "@/features/system/repository/stats-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";

/**
 * Leaf repos whose only infra dep is AppDrizzleDatabase (ADR-0001 point 4).
 * This is the single production provision site for every repository tag:
 * merged once into the app layer, and embedded (as the same canonical
 * `.Default` objects) in the `dependencies:` of consuming services, so the
 * layer memo map builds one instance per tag. Feature layers must not
 * re-provide repositories; `DefaultWithoutDependencies` remains the
 * test-only override seam.
 */
export const PureDbLeaves = Layer.mergeAll(
  DatabaseSqlClientLive,
  AuthUserRepository.layer,
  BackgroundJobRepository.layer,
  DownloadRepository.layer,
  MediaRepository.layer,
  MediaUnitRepository.layer,
  AniDbUnitCacheRepository.layer,
  SeasonalMediaCacheRepository.layer,
  OperationsTaskRepository.layer,
  RssFeedRepository.layer,
  SystemLogRepository.layer,
  SystemStatsRepository.layer,
  SystemUnmappedRepository.layer,
  QualityProfileRepository.layer,
  ReleaseProfileRepository.layer,
  SystemConfigRepository.layer,
);
