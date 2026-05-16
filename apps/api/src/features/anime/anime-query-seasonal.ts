import { Effect } from "effect";

import {
  resolveSeasonFromDate,
  resolveSeasonYearFromDate,
  type AnimeSearchResult,
  type SeasonalAnimeQueryParams,
  type SeasonalAnimeResponse,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { AnimeSeasonalProviderServiceShape } from "@/features/anime/anime-seasonal-provider-service.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/anime/search-results.ts";

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const listSeasonalAnimeEffect = Effect.fn("AnimeQuerySeasonal.listSeasonalAnimeEffect")(
  function* (
    input: {
      db: AppDatabase;
      providerService: AnimeSeasonalProviderServiceShape;
      now: Date;
    } & SeasonalAnimeQueryParams,
  ) {
    const season = input.season ?? resolveSeasonFromDate(input.now);
    const year: number = input.year ?? resolveSeasonYearFromDate(input.now);
    const limit = clamp(input.limit ?? 12, 1, 50);
    const page = Math.max(1, Math.floor(input.page ?? 1));

    const seasonalResult = yield* input.providerService.getSeasonalAnime({
      season,
      year,
      limit,
      page,
    });

    const marked: Array<AnimeSearchResult> = yield* markSearchResultsAlreadyInLibraryEffect(
      input.db,
      seasonalResult.results,
    );

    return {
      degraded: seasonalResult.degraded,
      provider: seasonalResult.provider,
      results: marked,
      has_more: seasonalResult.hasMore,
      limit,
      page,
      season,
      year,
    } satisfies SeasonalAnimeResponse;
  },
);
