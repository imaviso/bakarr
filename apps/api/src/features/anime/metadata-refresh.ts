import { Effect } from "effect";

import { Database } from "@/db/database.ts";
import { makeSingleFlightEffectRunner } from "@/lib/effect-coalescing-single-flight-runner.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { AnimeMetadataProviderService } from "@/features/anime/anime-metadata-provider-service.ts";
import { refreshMetadataForMonitoredAnimeEffect } from "@/features/anime/anime-metadata-refresh-job.ts";

export const makeMetadataRefreshRunner = Effect.fn("AnimeMetadataRefresh.makeRunner")(function* () {
  const { db } = yield* Database;
  const metadataProvider = yield* AnimeMetadataProviderService;
  const clock = yield* ClockService;

  return yield* makeSingleFlightEffectRunner(
    refreshMetadataForMonitoredAnimeEffect({
      metadataProvider,
      db,
      nowIso: () => nowIsoFromClock(clock),
    }),
  );
});
