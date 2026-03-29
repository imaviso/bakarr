import { Effect } from "effect";

import { Database } from "@/db/database.ts";
import { makeSingleFlightEffectRunner } from "@/lib/effect-coalescing.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { refreshMetadataForMonitoredAnimeEffect } from "@/features/anime/orchestration-support.ts";

export const makeMetadataRefreshRunner = Effect.fn("AnimeMetadataRefresh.makeRunner")(function* () {
  const { db } = yield* Database;
  const aniList = yield* AniListClient;
  const clock = yield* ClockService;

  return yield* makeSingleFlightEffectRunner(
    refreshMetadataForMonitoredAnimeEffect({
      aniList,
      db,
      nowIso: () => nowIsoFromClock(clock),
    }),
  );
});
