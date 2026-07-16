import { Layer } from "effect";

import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import { SeasonalMediaCacheRepository } from "@/features/media/query/seasonal-media-cache-repository.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import { LibraryRootsRepository } from "@/features/operations/repository/library-roots-repository.ts";
import { OperationsTaskRepository } from "@/features/operations/repository/task-repository.ts";
import { RssFeedRepository } from "@/features/operations/repository/rss-feed-repository-service.ts";
import { BackgroundJobRepository } from "@/features/system/repository/background-job-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { ReleaseProfileRepository } from "@/features/system/repository/release-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";

/**
 * Leaf repos whose only infra dep is AppDrizzleDatabase (via runtime).
 * Provide once at lifecycle (`makeApiLifecycleLayers`); pass into feature layers for
 * construction. Do not re-merge inside media/ops feature layers.
 */
export const PureDbLeaves = Layer.mergeAll(
  BackgroundJobRepository.Default,
  DownloadRepository.Default,
  MediaReadRepository.Default,
  MediaUnitRepository.Default,
  AniDbUnitCacheRepository.Default,
  SeasonalMediaCacheRepository.Default,
  LibraryRootsRepository.Default,
  OperationsTaskRepository.Default,
  RssFeedRepository.Default,
  SystemLogRepository.Default,
  SystemUnmappedRepository.Default,
  QualityProfileRepository.Default,
  ReleaseProfileRepository.Default,
  SystemConfigRepository.Default,
);

export function providePureDbLeaves<ROut, E, RIn>(runtimeSupportLayer: Layer.Layer<ROut, E, RIn>) {
  return PureDbLeaves.pipe(Layer.provide(runtimeSupportLayer));
}
