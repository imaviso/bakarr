import { Config as EffectConfig, Effect, Schema } from "effect";

import { AppDrizzleDatabase } from "@/db/database.ts";
import { PositiveIntFromStringSchema } from "@/domain/domain-schema.ts";
import { makeSingleFlightEffectRunner } from "@/infra/effect/coalescing-single-flight-runner.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { AnimeImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { AnimeMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { refreshMetadataForMonitoredAnimeEffect } from "@/features/media/metadata/media-metadata-refresh-job.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";

const DEFAULT_METADATA_REFRESH_CONCURRENCY = 2;

export const makeMetadataRefreshRunner = Effect.fn("AnimeMetadataRefresh.makeRunner")(function* () {
  const db = yield* AppDrizzleDatabase;
  const imageCacheService = yield* AnimeImageCacheService;
  const metadataProvider = yield* AnimeMetadataProviderService;
  const mediaReadRepository = yield* MediaReadRepository;
  const refreshConcurrency = yield* Schema.Config(
    "BAKARR_METADATA_REFRESH_CONCURRENCY",
    PositiveIntFromStringSchema,
  ).pipe(EffectConfig.orElse(() => EffectConfig.succeed(DEFAULT_METADATA_REFRESH_CONCURRENCY)));

  return yield* makeSingleFlightEffectRunner(
    refreshMetadataForMonitoredAnimeEffect({
      imageCacheService,
      metadataProvider,
      db,
      mediaReadRepository,
      nowIso: currentNowIso,
      refreshConcurrency,
    }),
  );
});
