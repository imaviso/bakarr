import {
  brandMediaId,
  type MediaKind,
  type MediaSearchResult,
  type MediaSeason,
} from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import type { ProviderMediaSearchResult } from "@/features/media/metadata/metadata-model.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import {
  MediaMetadataEnrichmentService,
  type MediaMetadataEnrichmentCacheState,
} from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { mergeAnimeMetadataEpisodes } from "@/features/media/units/unit-merge.ts";
import type { StoredDataError } from "@/features/errors.ts";
import type { AniDbRuntimeConfigError } from "@/features/media/errors.ts";
import { TenraiClient } from "@/features/media/metadata/tenrai.ts";
import type { TenraiNormalizedAnime } from "@/features/media/metadata/tenrai-model.ts";
import type { TenraiNormalizedSeasonalEntry } from "@/features/media/metadata/tenrai-model.ts";
import { mergeAnimeMetadata } from "@/features/media/metadata/metadata-merge.ts";
import { mediaKindFromAniListFormat } from "@/features/media/shared/media-kind.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import { AniListDetailCacheRepository } from "@/features/media/metadata/anilist-detail-cache-repository.ts";
import { ExternalIdMapRepository } from "@/features/media/metadata/external-id-map-repository.ts";
import type {
  AnimeDetailOrigin,
  CachedAnimeDetail,
} from "@/features/media/metadata/anilist-detail-cache-repository.ts";
import { Clock, Context, Effect, Layer, Option } from "effect";

export function toMediaSearchResult(entry: ProviderMediaSearchResult): MediaSearchResult {
  return {
    ...entry,
    id: brandMediaId(entry.id),
  };
}

export interface MediaSeasonalResult {
  readonly provider: "anilist" | "tenrai_fallback";
  readonly degraded: boolean;
  readonly hasMore: boolean;
  readonly results: ReadonlyArray<MediaSearchResult>;
  readonly season: MediaSeason;
  readonly year: number;
}

export const searchMediaWithFallback = Effect.fn("MediaMetadata.searchMediaWithFallback")(
  function* (input: {
    aniList: Pick<typeof AniListClient.Service, "searchAnimeMetadata">;
    query: string;
    mediaKind: MediaKind;
  }) {
    const results = yield* input.aniList.searchAnimeMetadata(input.query, input.mediaKind);

    return {
      degraded: false,
      results: results.map(toMediaSearchResult),
    };
  },
);

export const seasonalWithFallback = Effect.fn("MediaMetadata.seasonalWithFallback")(
  function* (input: {
    aniList: Pick<typeof AniListClient.Service, "getSeasonalAnime" | "resolveAniListIdFromMalId">;
    idMap: Pick<typeof ExternalIdMapRepository.Service, "loadByMalId" | "upsert">;
    tenrai: Pick<typeof TenraiClient.Service, "getSeasonalAnime">;
    season: MediaSeason;
    year: number;
    limit: number;
    page: number;
  }) {
    const anilistAttempt = yield* input.aniList
      .getSeasonalAnime({
        page: input.page,
        season: input.season,
        year: input.year,
        limit: input.limit,
      })
      .pipe(Effect.result);

    if (anilistAttempt._tag === "Success") {
      return {
        degraded: false,
        hasMore: anilistAttempt.success.length === input.limit,
        provider: "anilist",
        results: anilistAttempt.success.map(toMediaSearchResult),
        season: input.season,
        year: input.year,
      } satisfies MediaSeasonalResult;
    }

    if (!shouldFallbackToTenrai(anilistAttempt.failure)) {
      return yield* anilistAttempt.failure;
    }

    yield* Effect.logWarning("AniList seasonal request failed; using Tenrai fallback").pipe(
      Effect.annotateLogs({
        causeTag: anilistAttempt.failure._tag,
        operation: anilistAttempt.failure.operation,
        season: input.season,
        year: input.year,
      }),
    );

    const tenraiEntries = yield* input.tenrai.getSeasonalAnime({
      limit: input.limit,
      page: input.page,
      season: input.season,
      year: input.year,
    });

    // A 429 means AniList is shedding our load: resolve from the local map
    // only instead of firing up to `limit` more upstream queries at it.
    const rateLimited = anilistAttempt.failure.status === 429;

    if (rateLimited) {
      yield* Effect.logWarning("AniList rate limited; resolving seasonal ids from local map").pipe(
        Effect.annotateLogs({ season: input.season, year: input.year }),
      );
    }

    const remote: MalIdResolver = rateLimited
      ? { resolveAniListIdFromMalId: () => Effect.succeed(Option.none()) }
      : input.aniList;

    const mappedEntries = yield* Effect.forEach(tenraiEntries, (entry) =>
      resolveAniListIdFromMalId(input.idMap, remote, entry.malId).pipe(
        Effect.map((anilistIdOption): [typeof entry, Option.Option<number>] => [
          entry,
          anilistIdOption,
        ]),
      ),
    );

    const results: Array<MediaSearchResult> = [];

    for (const [entry, anilistIdOption] of mappedEntries) {
      if (Option.isSome(anilistIdOption)) {
        results.push(
          mapTenraiEntryToSearchResult(entry, anilistIdOption.value, input.season, input.year),
        );
      }
    }

    return {
      degraded: true,
      hasMore: tenraiEntries.length === input.limit,
      provider: "tenrai_fallback",
      results,
      season: input.season,
      year: input.year,
    } satisfies MediaSeasonalResult;
  },
);

function toAnimeSeason(value: string | undefined): MediaSeason | undefined {
  if (value === "winter" || value === "spring" || value === "summer" || value === "fall") {
    return value;
  }

  return undefined;
}

function mapTenraiEntryToSearchResult(
  entry: TenraiNormalizedSeasonalEntry,
  anilistId: number,
  fallbackSeason: MediaSeason,
  fallbackYear: number,
): MediaSearchResult {
  const season = toAnimeSeason(entry.season) ?? fallbackSeason;
  const seasonYear = entry.seasonYear ?? fallbackYear;
  const startYear = entry.startYear ?? seasonYear;

  return {
    already_in_library: false,
    cover_image: entry.coverImage,
    unit_count: entry.unitCount,
    format: entry.format,
    genres: entry.genres ? [...entry.genres] : undefined,
    id: brandMediaId(anilistId),
    season,
    season_year: seasonYear,
    start_year: startYear,
    status: entry.status,
    title: {
      english: entry.title.english,
      native: entry.title.native,
      romaji: entry.title.romaji,
    },
  };
}

function shouldFallbackToTenrai(error: ExternalCallError) {
  return error.operation === "anilist.seasonal" || error.operation === "anilist.seasonal.response";
}

export const getCachedOrRemoteDetail = Effect.fn("MediaMetadata.getCachedOrRemoteDetail")(
  function* (input: {
    aniList: Pick<typeof AniListClient.Service, "getAnimeMetadataById">;
    detailCache: typeof AniListDetailCacheRepository.Service;
    id: number;
    mediaKind: MediaKind | undefined;
  }) {
    const nowMs = yield* Clock.currentTimeMillis;

    const cached = yield* input.detailCache.read(input.id, nowMs);
    if (cached !== null && cached.origin === "live") {
      return Option.some(cached);
    }

    const remote = yield* input.aniList.getAnimeMetadataById(input.id, input.mediaKind).pipe(
      Effect.map((metadata) =>
        Option.map(metadata, (data) => ({ data, origin: "live" }) satisfies CachedAnimeDetail),
      ),
      Effect.catchTag("ExternalCallError", (error) =>
        Effect.gen(function* () {
          if (cached === null) {
            return yield* error;
          }

          yield* Effect.logWarning("AniList detail failed; using stale cache").pipe(
            Effect.annotateLogs({
              mediaId: input.id,
              operation: error.operation,
            }),
          );

          return Option.some(cached);
        }),
      ),
    );

    // Stale serves keep their original timestamp so the next lookup retries
    // live instead of extending the stale window indefinitely.
    if (Option.isNone(remote)) {
      return remote;
    }

    yield* input.detailCache.write(
      input.id,
      input.mediaKind ?? mediaKindFromAniListFormat(remote.value.data.format),
      remote.value.data,
      nowMs,
    );
    return remote;
  },
);

export type MediaMetadataLookupResult =
  | {
      readonly _tag: "NotFound";
    }
  | {
      readonly _tag: "Found";
      readonly detailOrigin: AnimeDetailOrigin;
      readonly enrichment: MediaMetadataEnrichmentResult;
      readonly metadata: AnimeMetadata;
    };

export type MediaMetadataEnrichmentResult =
  | {
      readonly _tag: "Enriched";
      readonly mediaUnits: number;
      readonly provider: "AniDB";
    }
  | {
      readonly _tag: "Degraded";
      readonly reason: AnimeMetadataDegradationReason;
    };

export type AnimeMetadataDegradationReason =
  | {
      readonly _tag: "AniDbNoEpisodeMetadata";
    }
  | {
      readonly _tag: "AniDbRefreshPending";
      readonly cacheState: "missing" | "stale";
    };

export type AnimeMetadataLookupError =
  | ExternalCallError
  | DatabaseError
  | StoredDataError
  | AniDbRuntimeConfigError;

export interface MediaMetadataProviderServiceShape {
  readonly getAnimeMetadataById: (
    id: number,
    mediaKind?: MediaKind,
  ) => Effect.Effect<MediaMetadataLookupResult, AnimeMetadataLookupError>;
  readonly getSeasonalAnime: (input: {
    season: MediaSeason;
    year: number;
    limit: number;
    page: number;
  }) => Effect.Effect<MediaSeasonalResult, ExternalCallError>;
  readonly searchMedia: (
    query: string,
    mediaKind?: MediaKind,
  ) => Effect.Effect<
    {
      readonly degraded: boolean;
      readonly results: MediaSearchResult[];
    },
    ExternalCallError
  >;
}

const makeMediaMetadataProviderService = Effect.fn("MediaMetadataProviderService.make")(
  function* () {
    const aniList = yield* AniListClient;
    const tenrai = yield* TenraiClient;
    const idMap = yield* ExternalIdMapRepository;
    const enrichmentService = yield* MediaMetadataEnrichmentService;
    const detailCache = yield* AniListDetailCacheRepository;

    const getAnimeMetadataById = Effect.fn("MediaMetadataProviderService.getAnimeMetadataById")(
      function* (id: number, mediaKind?: MediaKind) {
        const metadata = yield* getCachedOrRemoteDetail({
          aniList,
          detailCache,
          id,
          mediaKind,
        });

        if (Option.isNone(metadata)) {
          return { _tag: "NotFound" } satisfies MediaMetadataLookupResult;
        }

        const baseMetadata = metadata.value.data;
        const detailOrigin: AnimeDetailOrigin = metadata.value.origin;
        const effectiveMediaKind = mediaKind ?? mediaKindFromAniListFormat(baseMetadata.format);
        if (effectiveMediaKind !== "anime") {
          return {
            _tag: "Found",
            detailOrigin,
            enrichment: {
              _tag: "Degraded",
              reason: { _tag: "AniDbNoEpisodeMetadata" },
            },
            metadata: baseMetadata,
          } satisfies MediaMetadataLookupResult;
        }

        const effectiveMalId = Option.fromNullishOr(baseMetadata.malId);

        const tenraiMetadata = Option.isSome(effectiveMalId)
          ? yield* optionalExternalMetadataLookup(tenrai.getAnimeByMalId(effectiveMalId.value), {
              lookup: "getAnimeByMalId",
              malId: effectiveMalId.value,
              mediaId: baseMetadata.id,
              provider: "Tenrai",
            })
          : Option.none<TenraiNormalizedAnime>();
        const malToAniListId = yield* resolveMalToAniListIdMap(tenraiMetadata, idMap, aniList);
        const mergedMetadata = mergeAnimeMetadata({
          anilist: baseMetadata,
          ...(Option.isSome(tenraiMetadata) ? { tenrai: tenraiMetadata.value } : {}),
          ...(malToAniListId === undefined ? {} : { malToAniListId }),
        });

        if (Option.isSome(effectiveMalId)) {
          yield* idMap.upsert({ anilistId: baseMetadata.id, malId: effectiveMalId.value }).pipe(
            Effect.catch((error) =>
              Effect.logWarning("External id map store degraded").pipe(
                Effect.annotateLogs({
                  anilistId: baseMetadata.id,
                  error: error.message,
                  malId: effectiveMalId.value,
                }),
              ),
            ),
          );
        }

        const cacheState = yield* enrichmentService.getAniDbCacheState(mergedMetadata.id);

        if (cacheState._tag === "Fresh") {
          return yield* toFreshLookupResult(mergedMetadata, cacheState, detailOrigin);
        }

        yield* enrichmentService.requestAniDbRefresh({
          mediaId: mergedMetadata.id,
          unitCount: mergedMetadata.unitCount,
          synonyms: mergedMetadata.synonyms,
          title: mergedMetadata.title,
        });

        const result: MediaMetadataLookupResult = {
          _tag: "Found",
          detailOrigin,
          enrichment: {
            _tag: "Degraded",
            reason: {
              _tag: "AniDbRefreshPending",
              cacheState: cacheState._tag === "Missing" ? "missing" : "stale",
            },
          },
          metadata: mergedMetadata,
        };

        yield* logEnrichmentResult(mergedMetadata.id, result.enrichment);
        return result;
      },
    );

    const getSeasonalAnime = Effect.fn("MediaMetadataProviderService.getSeasonalAnime")(
      function* (input: { season: MediaSeason; year: number; limit: number; page: number }) {
        return yield* seasonalWithFallback({
          aniList,
          idMap,
          tenrai,
          ...input,
        });
      },
    );

    const searchMedia = Effect.fn("MediaMetadataProviderService.searchMedia")(function* (
      query: string,
      mediaKind?: MediaKind,
    ) {
      return yield* searchMediaWithFallback({
        aniList,
        mediaKind: mediaKind ?? "anime",
        query,
      });
    });

    return {
      getAnimeMetadataById,
      getSeasonalAnime,
      searchMedia,
    } satisfies MediaMetadataProviderServiceShape;
  },
);

export class MediaMetadataProviderService extends Context.Service<
  MediaMetadataProviderService,
  MediaMetadataProviderServiceShape
>()("@bakarr/api/MediaMetadataProviderService") {
  static readonly layer = Layer.effect(
    MediaMetadataProviderService,
    makeMediaMetadataProviderService(),
  );
}

export const MediaMetadataProviderServiceLive = MediaMetadataProviderService.layer;

const toFreshLookupResult = Effect.fn("MediaMetadataProviderService.toFreshLookupResult")(
  function* (
    baseMetadata: AnimeMetadata,
    cacheState: Extract<MediaMetadataEnrichmentCacheState, { _tag: "Fresh" }>,
    detailOrigin: AnimeDetailOrigin,
  ) {
    const mergedEpisodes = mergeLookupEpisodes(baseMetadata, cacheState);

    if (cacheState.mediaUnits.length === 0) {
      const result: MediaMetadataLookupResult = {
        _tag: "Found",
        detailOrigin,
        enrichment: {
          _tag: "Degraded",
          reason: {
            _tag: "AniDbNoEpisodeMetadata",
          },
        },
        metadata: baseMetadata,
      };

      yield* logEnrichmentResult(baseMetadata.id, result.enrichment);
      return result;
    }

    return {
      _tag: "Found",
      detailOrigin,
      enrichment: {
        _tag: "Enriched",
        mediaUnits: cacheState.mediaUnits.length,
        provider: "AniDB",
      },
      metadata: {
        ...baseMetadata,
        mediaUnits: mergedEpisodes,
      },
    } satisfies MediaMetadataLookupResult;
  },
);

const mergeLookupEpisodes = (
  metadata: AnimeMetadata,
  cacheState: Extract<MediaMetadataEnrichmentCacheState, { _tag: "Fresh" }>,
): AnimeMetadata["mediaUnits"] => {
  return mergeAnimeMetadataEpisodes(metadata.mediaUnits, cacheState.mediaUnits);
};

const logEnrichmentResult = Effect.fn("MediaMetadataProviderService.logEnrichmentResult")(
  function* (mediaId: number, result: MediaMetadataEnrichmentResult) {
    if (result._tag === "Enriched") {
      return;
    }

    const reason = result.reason;

    yield* Effect.logInfo("AniDB enrichment degraded").pipe(
      Effect.annotateLogs({
        mediaId,
        provider: "AniDB",
        reason: reason._tag,
        ...(reason._tag === "AniDbRefreshPending" ? { cacheState: reason.cacheState } : {}),
      }),
    );
  },
);

interface MalIdResolver {
  readonly resolveAniListIdFromMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<number>, ExternalCallError>;
}

type ExternalIdMapStore = Pick<typeof ExternalIdMapRepository.Service, "loadByMalId" | "upsert">;

// Self-owned MAL→AniList mapping: the local map answers repeats, misses fall
// through to one AniList idMal query and are stored. Failures degrade to None
// so a broken map never fails the lookup it enriches.
const resolveAniListIdFromMalId = Effect.fn("MediaMetadata.resolveAniListIdFromMalId")(function* (
  idMap: ExternalIdMapStore,
  resolver: MalIdResolver,
  malId: number,
) {
  const cached = yield* idMap
    .loadByMalId(malId)
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("External id map lookup degraded").pipe(
          Effect.annotateLogs({ error: error.message, malId }),
          Effect.as(Option.none()),
        ),
      ),
    );

  if (Option.isSome(cached)) {
    return Option.some(cached.value.anilistId);
  }

  const remote = yield* optionalExternalMetadataLookup(resolver.resolveAniListIdFromMalId(malId), {
    lookup: "resolveAniListIdFromMalId",
    malId,
    provider: "AniList",
  });

  if (Option.isSome(remote)) {
    yield* idMap
      .upsert({ anilistId: remote.value, malId })
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("External id map store degraded").pipe(
            Effect.annotateLogs({ anilistId: remote.value, error: error.message, malId }),
          ),
        ),
      );
  }

  return remote;
});

const resolveMalToAniListIdMap = Effect.fn("MediaMetadataProviderService.resolveMalToAniListIdMap")(
  function* (
    tenraiMetadata: Option.Option<TenraiNormalizedAnime>,
    idMap: ExternalIdMapStore,
    resolver: MalIdResolver,
  ) {
    if (Option.isNone(tenraiMetadata)) {
      return undefined;
    }

    const recommendationMalIds = (tenraiMetadata.value.recommendations ?? []).map(
      (recommendation) => recommendation.malId,
    );
    const uniqueMalIds = [
      ...new Set([
        ...tenraiMetadata.value.relations.map((relation) => relation.malId),
        ...recommendationMalIds,
      ]),
    ];

    if (uniqueMalIds.length === 0) {
      return undefined;
    }

    const pairs = yield* Effect.forEach(
      uniqueMalIds,
      (malId) =>
        resolveAniListIdFromMalId(idMap, resolver, malId).pipe(
          Effect.map((mediaId): [number, Option.Option<number>] => [malId, mediaId]),
        ),
      { concurrency: 4 },
    );

    const output = new Map<number, number>();

    for (const [malId, mediaId] of pairs) {
      if (Option.isSome(mediaId)) {
        output.set(malId, mediaId.value);
      }
    }

    return output.size > 0 ? output : undefined;
  },
);

function optionalExternalMetadataLookup<A>(
  effect: Effect.Effect<Option.Option<A>, ExternalCallError>,
  annotations: ExternalMetadataLookupAnnotations,
): Effect.Effect<Option.Option<A>> {
  return effect.pipe(
    Effect.catch((error) =>
      Effect.logWarning(`${annotations.provider} lookup degraded`).pipe(
        Effect.annotateLogs({
          ...annotations,
          error: error.message,
          operation: error.operation,
        }),
        Effect.as(Option.none<A>()),
      ),
    ),
  );
}

interface ExternalMetadataLookupAnnotations {
  readonly lookup: string;
  readonly malId?: number;
  readonly mediaId?: number;
  readonly provider: "Tenrai" | "AniList";
}
