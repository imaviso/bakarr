import { DateTime, Effect, Option } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import { searchMediaWithFallback } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { StoredDataError } from "@/features/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { nowIso } from "@/infra/time.ts";
import { deriveAnimeSeason } from "@/features/media/shared/date-utils.ts";
import { deriveEpisodeTimelineMetadata } from "@/features/media/shared/derivations.ts";
import { MediaSeasonalProviderService } from "@/features/media/query/media-seasonal-provider-service.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/media/query/search-results.ts";
import { annotateMediaSearchResultsForQuery } from "@/features/media/query/media-search-annotation.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { SeasonalMediaCacheRepository } from "@/features/media/query/seasonal-media-cache-repository.ts";
import {
  toMediaDto,
  deriveDetailProgress,
  deriveListProgress,
} from "@/features/media/shared/dto.ts";
import {
  brandMediaId,
  type CalendarEvent,
  type Media,
  type MediaKind,
  type MediaListQueryParams,
  type MediaListResponse,
  type MediaSearchResponse,
  type MediaSearchResult,
  type MediaSeason,
  type MediaUnit,
  type MissingUnit,
  type SeasonalMediaQueryParams,
  type SeasonalMediaResponse,
  resolveSeasonFromDate,
  resolveSeasonYearFromDate,
} from "@packages/shared/index.ts";

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

interface UnitStats {
  readonly downloaded: number;
  readonly latestDownloadedUnit?: number;
}

const DTO_PROGRESS_YIELD_INTERVAL = 50;

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
  readonly listUnits: (mediaId: number) => Effect.Effect<MediaUnit[], DatabaseError>;
  readonly listSeasonalMedia: (
    params?: SeasonalMediaQueryParams,
  ) => Effect.Effect<SeasonalMediaResponse, DatabaseError | ExternalCallError>;
  readonly listWantedMissing: (limit: number) => Effect.Effect<MissingUnit[], DatabaseError>;
  readonly listCalendarEvents: (
    start?: string,
    end?: string,
  ) => Effect.Effect<CalendarEvent[], DatabaseError>;
}

const makeMediaQueryService = Effect.fn("MediaQueryService.make")(function* () {
  const aniList = yield* AniListClient;
  const manami = yield* ManamiClient;
  const mediaRepository = yield* MediaRepository;
  const providerService = yield* MediaSeasonalProviderService;
  const seasonalMediaCacheRepository = yield* SeasonalMediaCacheRepository;

  const service: MediaQueryServiceShape = {
    getMedia: Effect.fn("MediaQueryService.getMedia")(function* (id: number) {
      const row = yield* mediaRepository.getMediaRow(id);
      const unitRows = yield* mediaRepository.listUnitRowsByMediaId(id);

      return yield* toMediaDto(row, deriveDetailProgress(unitRows, row.unitCount ?? undefined));
    }),
    getMediaByAnilistId: Effect.fn("MediaQueryService.getMediaByAnilistId")(function* (
      id: number,
      mediaKind?: MediaKind,
    ) {
      const effectiveMediaKind = mediaKind ?? "anime";
      const metadata = yield* aniList.getAnimeMetadataById(id, effectiveMediaKind);

      if (Option.isNone(metadata)) {
        return yield* new MediaNotFoundError({
          message: "Media not found",
        });
      }
      const metadataValue = metadata.value;

      const alreadyInLibrary = yield* mediaRepository.mediaExists(id);

      return {
        already_in_library: alreadyInLibrary,
        banner_image: metadataValue.bannerImage,
        cover_image: metadataValue.coverImage,
        description: metadataValue.description,
        duration: metadataValue.duration,
        end_date: metadataValue.endDate,
        end_year: metadataValue.endYear,
        unit_count: metadataValue.unitCount,
        favorites: metadataValue.favorites,
        format: metadataValue.format,
        genres: metadataValue.genres ? [...metadataValue.genres] : undefined,
        id: brandMediaId(metadataValue.id),
        media_kind: effectiveMediaKind,
        members: metadataValue.members,
        popularity: metadataValue.popularity,
        rank: metadataValue.rank,
        rating: metadataValue.rating,
        recommended_media: metadataValue.recommendedMedia
          ? [...metadataValue.recommendedMedia]
          : undefined,
        related_media: metadataValue.relatedMedia ? [...metadataValue.relatedMedia] : undefined,
        season: deriveAnimeSeason(metadataValue.startDate),
        season_year: metadataValue.startYear,
        source: metadataValue.source,
        start_date: metadataValue.startDate,
        start_year: metadataValue.startYear,
        status: metadataValue.status,
        synonyms: metadataValue.synonyms ? [...metadataValue.synonyms] : undefined,
        title: metadataValue.title,
      } satisfies MediaSearchResult;
    }),
    listMedia: Effect.fn("MediaQueryService.listMedia")(function* (params?: MediaListQueryParams) {
      const limit = Math.min(Math.max(params?.limit ?? 100, 1), 500);
      const offset = Math.max(params?.offset ?? 0, 0);
      const monitoredFilter =
        params?.monitored === undefined ? {} : { monitored: params.monitored };

      const [mediaRows, total] = yield* Effect.all([
        mediaRepository.listMediaRows({ ...monitoredFilter, limit, offset }),
        mediaRepository.countMedia(monitoredFilter),
      ]);

      const mediaIds = mediaRows.map((row) => row.id);
      const unitStatsByMediaId = new Map<number, UnitStats>();

      if (mediaIds.length > 0) {
        const unitStats = yield* mediaRepository.listUnitProgressStats(mediaIds);

        for (const stat of unitStats) {
          const latestDownloadedUnit =
            stat.latestDownloadedUnit === null ? undefined : stat.latestDownloadedUnit;

          unitStatsByMediaId.set(stat.mediaId, {
            downloaded: stat.downloadedCount ?? 0,
            ...(latestDownloadedUnit === undefined ? {} : { latestDownloadedUnit }),
          });
        }
      }

      const missingUnitRows = yield* mediaRepository.listMissingUnitNumbers(mediaIds);

      const missingNumbersByMediaId = new Map<number, number[]>();
      for (const row of missingUnitRows) {
        const existing = missingNumbersByMediaId.get(row.mediaId);
        if (existing) {
          existing.push(row.number);
        } else {
          missingNumbersByMediaId.set(row.mediaId, [row.number]);
        }
      }

      const mediaDtos: Media[] = [];
      for (let index = 0; index < mediaRows.length; index++) {
        if (index > 0 && index % DTO_PROGRESS_YIELD_INTERVAL === 0) {
          yield* Effect.yieldNow();
        }

        const row = mediaRows[index];
        if (!row) {
          continue;
        }

        const unitStats = unitStatsByMediaId.get(row.id);
        mediaDtos.push(
          yield* toMediaDto(
            row,
            deriveListProgress({
              downloaded: unitStats?.downloaded ?? 0,
              ...(unitStats?.latestDownloadedUnit === undefined
                ? {}
                : { latestDownloadedUnit: unitStats.latestDownloadedUnit }),
              missingNumbers: missingNumbersByMediaId.get(row.id) ?? [],
              total: row.unitCount ?? undefined,
            }),
            undefined,
            { synonymsAsEmptyList: true },
          ),
        );
      }

      return {
        has_more: offset + limit < total,
        items: mediaDtos,
        limit,
        offset,
        total,
      } satisfies MediaListResponse;
    }),
    listUnits: Effect.fn("MediaQueryService.listUnits")(function* (mediaId: number) {
      const now = yield* DateTime.nowAsDate;
      const rows = yield* mediaRepository.listUnitRowsWithMediaKind(mediaId);

      return rows
        .toSorted((left, right) => left.unit.number - right.unit.number)
        .map((row): MediaUnit => {
          const unitRow = row.unit;
          const timeline = deriveEpisodeTimelineMetadata(unitRow.aired ?? undefined, now);

          return {
            aired: unitRow.aired ?? undefined,
            airing_status: timeline.airing_status,
            audio_channels: unitRow.audioChannels ?? undefined,
            audio_codec: unitRow.audioCodec ?? undefined,
            downloaded: unitRow.downloaded,
            duration_seconds: unitRow.durationSeconds ?? undefined,
            file_path: unitRow.filePath ?? undefined,
            file_size: unitRow.fileSize ?? undefined,
            group: unitRow.groupName ?? undefined,
            is_future: timeline.is_future,
            number: unitRow.number,
            quality: unitRow.quality ?? undefined,
            resolution: unitRow.resolution ?? undefined,
            title: unitRow.title ?? undefined,
            unit_kind: row.mediaKind === "anime" ? "episode" : "volume",
            video_codec: unitRow.videoCodec ?? undefined,
          };
        });
    }),
    searchMedia: Effect.fn("MediaQueryService.searchMedia")(function* (
      query: string,
      mediaKind?: MediaKind,
    ) {
      const effectiveMediaKind = mediaKind ?? "anime";
      const providerResult = yield* searchMediaWithFallback({
        aniList,
        manami,
        mediaKind: effectiveMediaKind,
        query,
      });

      const annotated = annotateMediaSearchResultsForQuery(query, providerResult.results);

      const marked = yield* markSearchResultsAlreadyInLibraryEffect(mediaRepository, annotated);

      return {
        degraded: providerResult.degraded,
        results: marked,
      } satisfies MediaSearchResponse;
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

      const rawResponse = yield* Effect.gen(function* () {
        const seasonalResult = yield* providerService.getSeasonalAnime({
          season,
          year,
          limit,
          page,
        });

        const marked = yield* markSearchResultsAlreadyInLibraryEffect(
          mediaRepository,
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
        } satisfies SeasonalMediaResponse;
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
    listWantedMissing: Effect.fn("MediaQueryService.listWantedMissing")(function* (limit: number) {
      const now = yield* nowIso();
      return yield* mediaRepository.listWantedMissing(limit, now);
    }),
    listCalendarEvents: Effect.fn("MediaQueryService.listCalendarEvents")(function* (
      start?: string,
      end?: string,
    ) {
      // Query params are optional at the HTTP boundary (CalendarQuerySchema)
      // for backward compat; missing values default to now so the call
      // returns an empty window rather than throwing. Callers that need a
      // real window must pass explicit ISO datetimes.
      const nowIsoValue = yield* nowIso();
      const now = new Date(nowIsoValue);
      return yield* mediaRepository.listCalendarEvents(
        start ?? nowIsoValue,
        end ?? nowIsoValue,
        now,
      );
    }),
  };
  return service;
});

export class MediaQueryService extends Effect.Service<MediaQueryService>()(
  "@bakarr/api/MediaQueryService",
  {
    // AniList/Manami clients come from the lifecycle layer.
    dependencies: [
      MediaRepository.Default,
      MediaSeasonalProviderService.Default,
      SeasonalMediaCacheRepository.Default,
    ],
    effect: makeMediaQueryService(),
  },
) {}

export const MediaQueryServiceLive = MediaQueryService.Default;
