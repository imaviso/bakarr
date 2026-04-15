import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";

import { Database, DatabaseError } from "@/db/database.ts";
import { ClockService } from "@/lib/clock.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
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
import {
  SeasonalAnimeResponseSchema,
  resolveSeasonFromDate,
  resolveSeasonYearFromDate,
} from "@packages/shared/index.ts";
import {
  type AnimeServiceError,
  AnimeStoredDataError,
  AnimeNotFoundError,
} from "@/features/anime/errors.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { listAnimeEffect } from "@/features/anime/anime-query-list.ts";
import { getAnimeEffect } from "@/features/anime/anime-query-get.ts";
import {
  searchAnimeEffect,
  getAnimeByAnilistIdEffect,
} from "@/features/anime/anime-query-search.ts";
import { listEpisodesEffect } from "@/features/anime/anime-query-episodes.ts";
import { AnimeSeasonalProviderService } from "@/features/anime/anime-seasonal-provider-service.ts";
import { listSeasonalAnimeEffect } from "@/features/anime/anime-query-seasonal.ts";
import { seasonalAnimeCache } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/lib/anime-search-results.ts";

const SEASONAL_ANIME_CACHE_TTL_MS = 1000 * 60 * 5;

const SeasonalAnimeResponseJsonSchema = Schema.parseJson(SeasonalAnimeResponseSchema);
const decodeSeasonalAnimeResponse = Schema.decodeUnknown(SeasonalAnimeResponseJsonSchema);
const encodeSeasonalAnimeResponse = Schema.encode(SeasonalAnimeResponseJsonSchema);

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
        return yield* searchAnimeEffect({ aniList, db, query });
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

        const cachedRows = yield* tryDatabasePromise("Failed to load seasonal anime cache", () =>
          db
            .select({
              payload: seasonalAnimeCache.payload,
              fetchedAtMs: seasonalAnimeCache.fetchedAtMs,
            })
            .from(seasonalAnimeCache)
            .where(eq(seasonalAnimeCache.cacheKey, cacheKey))
            .limit(1),
        );
        const cached = cachedRows[0];

        if (cached && nowMs - cached.fetchedAtMs < SEASONAL_ANIME_CACHE_TTL_MS) {
          const decodedCached = yield* decodeSeasonalAnimeResponse(cached.payload).pipe(
            Effect.mapError(
              (cause) =>
                new DatabaseError({
                  cause,
                  message: "Failed to decode seasonal anime cache payload",
                }),
            ),
          );

          const markedResults = yield* markSearchResultsAlreadyInLibraryEffect(
            db,
            decodedCached.results,
          );

          return {
            ...decodedCached,
            results: markedResults,
          } satisfies SeasonalAnimeResponse;
        }

        const rawResponse = yield* listSeasonalAnimeEffect({
          db,
          limit,
          now,
          page,
          providerService,
          season,
          year,
        });

        const encodedPayload = yield* encodeSeasonalAnimeResponse(rawResponse).pipe(
          Effect.mapError(
            (cause) =>
              new DatabaseError({
                cause,
                message: "Failed to encode seasonal anime cache payload",
              }),
          ),
        );

        yield* tryDatabasePromise("Failed to upsert seasonal anime cache", () =>
          db
            .insert(seasonalAnimeCache)
            .values({
              cacheKey,
              season: rawResponse.season,
              year: rawResponse.year,
              limit: rawResponse.limit,
              page: rawResponse.page,
              payload: encodedPayload,
              fetchedAtMs: nowMs,
            })
            .onConflictDoUpdate({
              target: seasonalAnimeCache.cacheKey,
              set: {
                fetchedAtMs: nowMs,
                limit: rawResponse.limit,
                page: rawResponse.page,
                payload: encodedPayload,
                season: rawResponse.season,
                year: rawResponse.year,
              },
            }),
        );

        return rawResponse;
      }),
    } satisfies AnimeQueryServiceShape;
  }),
);
