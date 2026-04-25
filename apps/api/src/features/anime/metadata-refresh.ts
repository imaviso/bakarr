import { Config as EffectConfig, Effect, Schema } from "effect";

import { Database } from "@/db/database.ts";
import { PositiveIntFromStringSchema } from "@/domain/domain-schema.ts";
import { makeSingleFlightEffectRunner } from "@/infra/effect/coalescing-single-flight-runner.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { AnimeImageCacheService } from "@/features/anime/anime-image-cache-service.ts";
import { AnimeMetadataProviderService } from "@/features/anime/anime-metadata-provider-service.ts";
import { refreshMetadataForMonitoredAnimeEffect } from "@/features/anime/anime-metadata-refresh-job.ts";

const DEFAULT_METADATA_REFRESH_CONCURRENCY = 2;

export const makeMetadataRefreshRunner = Effect.fn("AnimeMetadataRefresh.makeRunner")(function* () {
  const { db } = yield* Database;
  const imageCacheService = yield* AnimeImageCacheService;
  const metadataProvider = yield* AnimeMetadataProviderService;
  const clock = yield* ClockService;
  const refreshConcurrency = yield* Schema.Config(
    "BAKARR_METADATA_REFRESH_CONCURRENCY",
    PositiveIntFromStringSchema,
  ).pipe(EffectConfig.orElse(() => EffectConfig.succeed(DEFAULT_METADATA_REFRESH_CONCURRENCY)));

  return yield* makeSingleFlightEffectRunner(
    refreshMetadataForMonitoredAnimeEffect({
      imageCacheService,
      metadataProvider,
      db,
      nowIso: () => nowIsoFromClock(clock),
      refreshConcurrency,
    }),
  );
});
