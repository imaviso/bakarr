import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "@/db/database.ts";
import { ClockService } from "@/infra/clock.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import type {
  MediaListQueryParams,
  MediaListResponse,
  MediaSearchResponse,
  MediaSearchResult,
  Media,
  MediaUnit,
  MediaSeason,
  MediaKind,
  SeasonalMediaQueryParams,
  SeasonalMediaResponse,
} from "@packages/shared/index.ts";
import { resolveSeasonFromDate, resolveSeasonYearFromDate } from "@packages/shared/index.ts";
import {
  type MediaServiceError,
  MediaStoredDataError,
  MediaNotFoundError,
} from "@/features/media/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { listAnimeEffect } from "@/features/media/query/media-query-list.ts";
import { getAnimeEffect } from "@/features/media/query/media-query-get.ts";
import {
  searchAnimeEffect,
  getAnimeByAnilistIdEffect,
} from "@/features/media/query/media-query-search.ts";
import { listEpisodesEffect } from "@/features/media/query/media-query-units.ts";
import { AnimeSeasonalProviderService } from "@/features/media/query/media-seasonal-provider-service.ts";
import { listSeasonalAnimeEffect } from "@/features/media/query/media-query-seasonal.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/media/query/search-results.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import {
  readSeasonalAnimeCache,
  readStaleSeasonalAnimeCache,
  writeSeasonalAnimeCache,
} from "@/features/media/query/seasonal-media-cache.ts";

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toSeasonalAnimeCacheKey(input: {
  season: MediaSeason;
  year: number;
  limit: number;
  page: number;
}) {
  return `${input.season}:${input.year}:${input.limit}:${input.page}`;
}

export interface AnimeQueryServiceShape {
  readonly listMedia: (
    params?: MediaListQueryParams,
  ) => Effect.Effect<MediaListResponse, DatabaseError | MediaStoredDataError>;
  readonly getMedia: (id: number) => Effect.Effect<Media, MediaServiceError | DatabaseError>;
  readonly searchAnime: (
    query: string,
    mediaKind?: MediaKind,
  ) => Effect.Effect<MediaSearchResponse, DatabaseError | ExternalCallError | MediaStoredDataError>;
  readonly getAnimeByAnilistId: (
    id: number,
    mediaKind?: MediaKind,
  ) => Effect.Effect<MediaSearchResult, MediaNotFoundError | DatabaseError | ExternalCallError>;
  readonly listEpisodes: (mediaId: number) => Effect.Effect<MediaUnit[], DatabaseError>;
  readonly listSeasonalAnime: (
    params?: SeasonalMediaQueryParams,
  ) => Effect.Effect<SeasonalMediaResponse, DatabaseError | ExternalCallError>;
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
      getMedia: Effect.fn("AnimeQueryService.getMedia")(function* (id: number) {
        return yield* getAnimeEffect({ db, id });
      }),
      getAnimeByAnilistId: Effect.fn("AnimeQueryService.getAnimeByAnilistId")(function* (
        id: number,
        mediaKind?: MediaKind,
      ) {
        return yield* getAnimeByAnilistIdEffect({
          aniList,
          db,
          id,
          ...(mediaKind === undefined ? {} : { mediaKind }),
        });
      }),
      listMedia: Effect.fn("AnimeQueryService.listMedia")(function* (
        params?: MediaListQueryParams,
      ) {
        return yield* listAnimeEffect(db, params);
      }),
      listEpisodes: Effect.fn("AnimeQueryService.listEpisodes")(function* (mediaId: number) {
        const now = new Date(yield* clock.currentTimeMillis);
        return yield* listEpisodesEffect({ mediaId, db, now });
      }),
      searchAnime: Effect.fn("AnimeQueryService.searchAnime")(function* (
        query: string,
        mediaKind?: MediaKind,
      ) {
        return yield* searchAnimeEffect({
          aniList,
          db,
          manami,
          ...(mediaKind === undefined ? {} : { mediaKind }),
          query,
        });
      }),
      listSeasonalAnime: Effect.fn("AnimeQueryService.listSeasonalAnime")(function* (
        params?: SeasonalMediaQueryParams,
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
