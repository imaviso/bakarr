import { Config as EffectConfig, Effect, Schema } from "effect";

import { AppDrizzleDatabase } from "@/db/database.ts";
import { PositiveIntFromStringSchema } from "@/domain/domain-schema.ts";
import { makeSingleFlightEffectRunner } from "@/infra/effect/coalescing-single-flight-runner.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { refreshMetadataForMonitoredMediaEffect } from "@/features/media/metadata/media-metadata-refresh-job.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";

const DEFAULT_METADATA_REFRESH_CONCURRENCY = 2;

export const makeMetadataRefreshRunner = Effect.fn("MediaMetadataRefresh.makeRunner")(function* () {
  const db = yield* AppDrizzleDatabase;
  const imageCacheService = yield* MediaImageCacheService;
  const metadataProvider = yield* MediaMetadataProviderService;
  const mediaReadRepository = yield* MediaReadRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const refreshConcurrency = yield* Schema.Config(
    "BAKARR_METADATA_REFRESH_CONCURRENCY",
    PositiveIntFromStringSchema,
  ).pipe(EffectConfig.withDefault(DEFAULT_METADATA_REFRESH_CONCURRENCY));

  return yield* makeSingleFlightEffectRunner(
    refreshMetadataForMonitoredMediaEffect({
      imageCacheService,
      metadataProvider,
      db,
      mediaReadRepository,
      mediaUnitRepository,
      systemLogRepository,
      nowIso: currentNowIso,
      refreshConcurrency,
    }),
  );
});
