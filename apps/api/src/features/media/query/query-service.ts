import { DateTime, Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
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
import { StoredDataError } from "@/features/errors.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { listMediaEffect } from "@/features/media/query/media-query-list.ts";
import { getMediaEffect } from "@/features/media/query/media-query-get.ts";
import {
  searchMediaEffect,
  getMediaByAnilistIdEffect,
} from "@/features/media/query/media-query-search.ts";
import { listEpisodesEffect } from "@/features/media/query/media-query-units.ts";
import { MediaSeasonalProviderService } from "@/features/media/query/media-seasonal-provider-service.ts";
import { listSeasonalMediaEffect } from "@/features/media/query/media-query-seasonal.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/media/query/search-results.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { SeasonalMediaCacheRepository } from "@/features/media/query/seasonal-media-cache-repository.ts";

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toSeasonalMediaCacheKey(input: {
  season: MediaSeason;
  year: number;
  limit: number;
  page: number;
}) {
  return `${input.season}:${input.year}:${input.limit}:${input.page}`;
}

export interface MediaQueryServiceShape {
  readonly listMedia: (
    params?: MediaListQueryParams,
  ) => Effect.Effect<MediaListResponse, DatabaseError | StoredDataError>;
  readonly getMedia: (
    id: number,
  ) => Effect.Effect<Media, DatabaseError | MediaNotFoundError | StoredDataError>;
  readonly searchMedia: (
    query: string,
    mediaKind?: MediaKind,
  ) => Effect.Effect<MediaSearchResponse, DatabaseError | ExternalCallError | StoredDataError>;
  readonly getMediaByAnilistId: (
    id: number,
    mediaKind?: MediaKind,
  ) => Effect.Effect<MediaSearchResult, MediaNotFoundError | DatabaseError | ExternalCallError>;
  readonly listEpisodes: (mediaId: number) => Effect.Effect<MediaUnit[], DatabaseError>;
  readonly listSeasonalMedia: (
    params?: SeasonalMediaQueryParams,
  ) => Effect.Effect<SeasonalMediaResponse, DatabaseError | ExternalCallError>;
}

const makeMediaQueryService = Effect.fn("MediaQueryService.make")(function* () {
  const aniList = yield* AniListClient;
  const manami = yield* ManamiClient;
  const mediaRepository = yield* MediaRepository;
  const providerService = yield* MediaSeasonalProviderService;
  const seasonalMediaCacheRepository = yield* SeasonalMediaCacheRepository;

  const service: MediaQueryServiceShape = {
    getMedia: Effect.fn("MediaQueryService.getMedia")(function* (id: number) {
      return yield* getMediaEffect({ id, mediaRepository });
    }),
    getMediaByAnilistId: Effect.fn("MediaQueryService.getMediaByAnilistId")(function* (
      id: number,
      mediaKind?: MediaKind,
    ) {
      return yield* getMediaByAnilistIdEffect({
        aniList,
        id,
        mediaRepository,
        ...(mediaKind === undefined ? {} : { mediaKind }),
      });
    }),
    listMedia: Effect.fn("MediaQueryService.listMedia")(function* (params?: MediaListQueryParams) {
      return yield* listMediaEffect(mediaRepository, params);
    }),
    listEpisodes: Effect.fn("MediaQueryService.listEpisodes")(function* (mediaId: number) {
      const now = yield* DateTime.nowAsDate;
      return yield* listEpisodesEffect({ mediaId, mediaRepository, now });
    }),
    searchMedia: Effect.fn("MediaQueryService.searchMedia")(function* (
      query: string,
      mediaKind?: MediaKind,
    ) {
      return yield* searchMediaEffect({
        aniList,
        manami,
        mediaRepository,
        ...(mediaKind === undefined ? {} : { mediaKind }),
        query,
      });
    }),
    listSeasonalMedia: Effect.fn("MediaQueryService.listSeasonalMedia")(function* (
      params?: SeasonalMediaQueryParams,
    ) {
      const now = yield* DateTime.nowAsDate;
      const season = params?.season ?? resolveSeasonFromDate(now);
      const year = params?.year ?? resolveSeasonYearFromDate(now);
      const limit = clamp(params?.limit ?? 12, 1, 50);
      const page = Math.max(1, Math.floor(params?.page ?? 1));

      const cacheKey = toSeasonalMediaCacheKey({
        season,
        year,
        limit,
        page,
      });
      const nowMs = now.getTime();

      const cached = yield* seasonalMediaCacheRepository.read(cacheKey, nowMs);
      if (cached !== null) {
        const markedResults = yield* markSearchResultsAlreadyInLibraryEffect(
          mediaRepository,
          cached.results,
        );
        return { ...cached, results: markedResults };
      }

      const rawResponse = yield* listSeasonalMediaEffect({
        limit,
        mediaRepository,
        now,
        page,
        providerService,
        season,
        year,
      }).pipe(
        Effect.catchTag("ExternalCallError", (error) =>
          Effect.gen(function* () {
            const stale = yield* seasonalMediaCacheRepository.readStale(cacheKey);
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
              mediaRepository,
              stale.results,
            );
            return { ...stale, degraded: true, results: markedResults };
          }),
        ),
      );

      yield* seasonalMediaCacheRepository.write(cacheKey, rawResponse, nowMs);

      return rawResponse;
    }),
  };
  return service;
});

export class MediaQueryService extends Effect.Service<MediaQueryService>()(
  "@bakarr/api/MediaQueryService",
  {
    effect: makeMediaQueryService(),
  },
) {}

export const MediaQueryServiceLive = MediaQueryService.Default;
