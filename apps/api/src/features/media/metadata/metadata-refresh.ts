import { Config, Effect } from "effect";

import { PositiveIntFromStringSchema } from "@/infra/schema.ts";
import { makeSerializedShareEffectRunner } from "@/infra/effect/serialized-runner.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { refreshMetadataForMonitoredMediaEffect } from "@/features/media/metadata/media-metadata-refresh-job.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { BackgroundJobRepository } from "@/features/system/repository/background-job-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";

const DEFAULT_METADATA_REFRESH_CONCURRENCY = 2;

export const makeMetadataRefreshRunner = Effect.fn("MediaMetadataRefresh.makeRunner")(function* () {
  const backgroundJobRepository = yield* BackgroundJobRepository;
  const imageCacheService = yield* MediaImageCacheService;
  const metadataProvider = yield* MediaMetadataProviderService;
  const mediaRepository = yield* MediaRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const refreshConcurrency = yield* Config.schema(
    PositiveIntFromStringSchema,
    "BAKARR_METADATA_REFRESH_CONCURRENCY",
  ).pipe(Config.withDefault(DEFAULT_METADATA_REFRESH_CONCURRENCY));

  return yield* makeSerializedShareEffectRunner(
    refreshMetadataForMonitoredMediaEffect({
      imageCacheService,
      metadataProvider,
      backgroundJobRepository,
      mediaRepository,
      mediaUnitRepository,
      systemLogRepository,
      nowIso: currentNowIso,
      refreshConcurrency,
    }),
  );
});
