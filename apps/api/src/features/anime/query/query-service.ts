import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "@/db/database.ts";
import { ClockService } from "@/infra/clock.ts";
import { AniListClient } from "@/features/anime/metadata/anilist.ts";
import type {
  AnimeListQueryParams,
  AnimeListResponse,
  AnimeSearchResponse,
  AnimeSearchResult,
  Anime,
  Episode,
  AnimeSeason,
  SeasonalAnimeQueryParams,
  SeasonalAnimeResponse,
} from "@packages/shared/index.ts";
import { resolveSeasonFromDate, resolveSeasonYearFromDate } from "@packages/shared/index.ts";
import {
  type AnimeServiceError,
  AnimeStoredDataError,
  AnimeNotFoundError,
} from "@/features/anime/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { listAnimeEffect } from "@/features/anime/query/anime-query-list.ts";
import { getAnimeEffect } from "@/features/anime/query/anime-query-get.ts";
import {
  searchAnimeEffect,
  getAnimeByAnilistIdEffect,
} from "@/features/anime/query/anime-query-search.ts";
import { listEpisodesEffect } from "@/features/anime/query/anime-query-episodes.ts";
import { AnimeSeasonalProviderService } from "@/features/anime/query/anime-seasonal-provider-service.ts";
import { listSeasonalAnimeEffect } from "@/features/anime/query/anime-query-seasonal.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/anime/query/search-results.ts";
import { ManamiClient } from "@/features/anime/metadata/manami.ts";
import {
  readSeasonalAnimeCache,
  readStaleSeasonalAnimeCache,
  writeSeasonalAnimeCache,
} from "@/features/anime/query/seasonal-anime-cache.ts";

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toSeasonalAnimeCacheKey(input: {
  season: AnimeSeason;
  year: number;
  limit: number;
  page: number;
}) {
  return `${input.season}:${input.year}:${input.limit}:${input.page}`;
}

export interface AnimeQueryServiceShape {
  readonly listAnime: (
    params?: AnimeListQueryParams,
  ) => Effect.Effect<AnimeListResponse, DatabaseError | AnimeStoredDataError>;
  readonly getAnime: (id: number) => Effect.Effect<Anime, AnimeServiceError | DatabaseError>;
  readonly searchAnime: (
    query: string,
  ) => Effect.Effect<AnimeSearchResponse, DatabaseError | ExternalCallError | AnimeStoredDataError>;
  readonly getAnimeByAnilistId: (
    id: number,
  ) => Effect.Effect<AnimeSearchResult, AnimeNotFoundError | DatabaseError | ExternalCallError>;
  readonly listEpisodes: (animeId: number) => Effect.Effect<Episode[], DatabaseError>;
  readonly listSeasonalAnime: (
    params?: SeasonalAnimeQueryParams,
  ) => Effect.Effect<SeasonalAnimeResponse, DatabaseError | ExternalCallError>;
}

export class AnimeQueryService extends Context.Tag("@bakarr/api/AnimeQueryService")<
  AnimeQueryService,
  AnimeQueryServiceShape
>() {}

export const AnimeQueryServiceLive = Layer.effect(
  AnimeQueryService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const aniList = yield* AniListClient;
    const manami = yield* ManamiClient;
    const clock = yield* ClockService;
    const providerService = yield* AnimeSeasonalProviderService;

    return {
      getAnime: Effect.fn("AnimeQueryService.getAnime")(function* (id: number) {
        return yield* getAnimeEffect({ db, id });
      }),
      getAnimeByAnilistId: Effect.fn("AnimeQueryService.getAnimeByAnilistId")(function* (
        id: number,
      ) {
        return yield* getAnimeByAnilistIdEffect({ aniList, db, id });
      }),
      listAnime: Effect.fn("AnimeQueryService.listAnime")(function* (
        params?: AnimeListQueryParams,
      ) {
        return yield* listAnimeEffect(db, params);
      }),
      listEpisodes: Effect.fn("AnimeQueryService.listEpisodes")(function* (animeId: number) {
        const now = new Date(yield* clock.currentTimeMillis);
        return yield* listEpisodesEffect({ animeId, db, now });
      }),
      searchAnime: Effect.fn("AnimeQueryService.searchAnime")(function* (query: string) {
        return yield* searchAnimeEffect({ aniList, db, manami, query });
      }),
      listSeasonalAnime: Effect.fn("AnimeQueryService.listSeasonalAnime")(function* (
        params?: SeasonalAnimeQueryParams,
      ) {
        const now = new Date(yield* clock.currentTimeMillis);
        const season = params?.season ?? resolveSeasonFromDate(now);
        const year = params?.year ?? resolveSeasonYearFromDate(now);
        const limit = clamp(params?.limit ?? 12, 1, 50);
        const page = Math.max(1, Math.floor(params?.page ?? 1));

        const cacheKey = toSeasonalAnimeCacheKey({
          season,
          year,
          limit,
          page,
        });
        const nowMs = now.getTime();

        const cached = yield* readSeasonalAnimeCache(db, cacheKey, nowMs);
        if (cached !== null) {
          const markedResults = yield* markSearchResultsAlreadyInLibraryEffect(db, cached.results);
          return { ...cached, results: markedResults };
        }

        const rawResponse = yield* listSeasonalAnimeEffect({
          db,
          limit,
          now,
          page,
          providerService,
          season,
          year,
        }).pipe(
          Effect.catchTag("ExternalCallError", (error) =>
            Effect.gen(function* () {
              const stale = yield* readStaleSeasonalAnimeCache(db, cacheKey);
              if (stale === null) {
                return yield* error;
              }

              yield* Effect.logWarning("Seasonal provider failed; using stale cache").pipe(
                Effect.annotateLogs({
                  operation: error.operation,
                  season,
                  year,
                }),
              );

              const markedResults = yield* markSearchResultsAlreadyInLibraryEffect(
                db,
                stale.results,
              );
              return { ...stale, degraded: true, results: markedResults };
            }),
          ),
        );

        yield* writeSeasonalAnimeCache(db, cacheKey, rawResponse, nowMs);

        return rawResponse;
      }),
    } satisfies AnimeQueryServiceShape;
  }),
);
