import { Effect, Option } from "effect";

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
import { JikanClient } from "@/features/media/metadata/jikan.ts";
import type { JikanNormalizedAnime } from "@/features/media/metadata/jikan-model.ts";
import type { JikanNormalizedSeasonalEntry } from "@/features/media/metadata/jikan-model.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import { mergeAnimeMetadata } from "@/features/media/metadata/metadata-merge.ts";
import { mediaKindFromAniListFormat } from "@/features/media/shared/media-kind.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";

export function toMediaSearchResult(entry: ProviderMediaSearchResult): MediaSearchResult {
  return {
    ...entry,
    id: brandMediaId(entry.id),
  };
}

export interface MediaSeasonalResult {
  readonly provider: "anilist" | "jikan_fallback";
  readonly degraded: boolean;
  readonly hasMore: boolean;
  readonly results: ReadonlyArray<MediaSearchResult>;
  readonly season: MediaSeason;
  readonly year: number;
}

export const searchMediaWithFallback = Effect.fn("MediaMetadata.searchMediaWithFallback")(
  function* (input: {
    aniList: Pick<typeof AniListClient.Service, "searchAnimeMetadata">;
    manami: Pick<typeof ManamiClient.Service, "searchMedia"> | undefined;
    query: string;
    mediaKind: MediaKind;
  }) {
    let degraded = false;
    const results = yield* input.aniList.searchAnimeMetadata(input.query, input.mediaKind).pipe(
      Effect.flatMap((results) => {
        const manami = input.mediaKind === "anime" ? input.manami : undefined;
        return results.length === 0 && manami !== undefined
          ? Effect.gen(function* () {
              degraded = true;

              yield* Effect.logWarning(
                "AniList search returned no results; using Manami fallback",
              ).pipe(
                Effect.annotateLogs({
                  provider: "Manami",
                  queryLength: input.query.length,
                }),
              );

              return yield* manami.searchMedia(input.query, 20);
            })
          : Effect.succeed(results);
      }),
      Effect.catchTag("ExternalCallError", (error) =>
        Effect.gen(function* () {
          if (input.manami === undefined || input.mediaKind !== "anime") {
            return yield* error;
          }

          degraded = true;

          yield* Effect.logWarning("AniList search failed; using Manami fallback").pipe(
            Effect.annotateLogs({
              operation: error.operation,
              provider: "Manami",
              queryLength: input.query.length,
            }),
          );

          return yield* input.manami.searchMedia(input.query, 20);
        }),
      ),
    );

    return {
      degraded,
      results: results.map(toMediaSearchResult),
    };
  },
);

export const seasonalWithFallback = Effect.fn("MediaMetadata.seasonalWithFallback")(
  function* (input: {
    aniList: Pick<typeof AniListClient.Service, "getSeasonalAnime">;
    jikan: Pick<typeof JikanClient.Service, "getSeasonalAnime">;
    manami: Pick<typeof ManamiClient.Service, "resolveAniListIdFromMalId">;
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
      .pipe(Effect.either);

    if (anilistAttempt._tag === "Right") {
      return {
        degraded: false,
        hasMore: anilistAttempt.right.length === input.limit,
        provider: "anilist" as const,
        results: anilistAttempt.right.map(toMediaSearchResult),
        season: input.season,
        year: input.year,
      } satisfies MediaSeasonalResult;
    }

    if (!shouldFallbackToJikan(anilistAttempt.left)) {
      return yield* anilistAttempt.left;
    }

    yield* Effect.logWarning("AniList seasonal request failed; using Jikan fallback").pipe(
      Effect.annotateLogs({
        causeTag: anilistAttempt.left._tag,
        operation: anilistAttempt.left.operation,
        season: input.season,
        year: input.year,
      }),
    );

    const jikanEntries = yield* input.jikan.getSeasonalAnime({
      limit: input.limit,
      page: input.page,
      season: input.season,
      year: input.year,
    });

    const mappedEntries = yield* Effect.forEach(jikanEntries, (entry) =>
      input.manami.resolveAniListIdFromMalId(entry.malId).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning("Manami seasonal mapping degraded").pipe(
            Effect.annotateLogs({
              malId: entry.malId,
              operation: error.operation,
              provider: "Manami",
            }),
            Effect.as(Option.none<number>()),
          ),
        ),
        Effect.map((anilistIdOption) => [entry, anilistIdOption] as const),
      ),
    );

    const results: Array<MediaSearchResult> = [];

    for (const [entry, anilistIdOption] of mappedEntries) {
      if (Option.isSome(anilistIdOption)) {
        results.push(
          mapJikanEntryToSearchResult(entry, anilistIdOption.value, input.season, input.year),
        );
      }
    }

    return {
      degraded: true,
      hasMore: jikanEntries.length === input.limit,
      provider: "jikan_fallback" as const,
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

function mapJikanEntryToSearchResult(
  entry: JikanNormalizedSeasonalEntry,
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

function shouldFallbackToJikan(error: ExternalCallError) {
  return error.operation === "anilist.seasonal" || error.operation === "anilist.seasonal.response";
}

export type MediaMetadataLookupResult =
  | {
      readonly _tag: "NotFound";
    }
  | {
      readonly _tag: "Found";
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
    const jikan = yield* JikanClient;
    const manami = yield* ManamiClient;
    const enrichmentService = yield* MediaMetadataEnrichmentService;

    const getAnimeMetadataById = Effect.fn("MediaMetadataProviderService.getAnimeMetadataById")(
      function* (id: number, mediaKind?: MediaKind) {
        const metadata = yield* aniList.getAnimeMetadataById(id, mediaKind);

        if (Option.isNone(metadata)) {
          return { _tag: "NotFound" } as const satisfies MediaMetadataLookupResult;
        }

        const baseMetadata = metadata.value;
        const effectiveMediaKind = mediaKind ?? mediaKindFromAniListFormat(baseMetadata.format);
        if (effectiveMediaKind !== "anime") {
          return {
            _tag: "Found",
            enrichment: {
              _tag: "Degraded",
              reason: { _tag: "AniDbNoEpisodeMetadata" },
            },
            metadata: baseMetadata,
          } as const satisfies MediaMetadataLookupResult;
        }

        const manamiMetadata = yield* optionalExternalMetadataLookup(
          manami.getByAniListId(baseMetadata.id),
          {
            lookup: "getByAniListId",
            mediaId: baseMetadata.id,
            provider: "Manami",
          },
        );

        const effectiveMalId =
          baseMetadata.malId === undefined
            ? yield* optionalExternalMetadataLookup(
                manami.resolveMalIdFromAniListId(baseMetadata.id),
                {
                  lookup: "resolveMalIdFromAniListId",
                  mediaId: baseMetadata.id,
                  provider: "Manami",
                },
              )
            : Option.some(baseMetadata.malId);

        if (baseMetadata.malId === undefined && Option.isSome(effectiveMalId)) {
          yield* Effect.logInfo("Resolved MAL id from Manami").pipe(
            Effect.annotateLogs({
              mediaId: baseMetadata.id,
              malId: effectiveMalId.value,
              provider: "Manami",
            }),
          );
        }

        const jikanMetadata = Option.isSome(effectiveMalId)
          ? yield* optionalExternalMetadataLookup(jikan.getAnimeByMalId(effectiveMalId.value), {
              lookup: "getAnimeByMalId",
              malId: effectiveMalId.value,
              mediaId: baseMetadata.id,
              provider: "Jikan",
            })
          : Option.none<JikanNormalizedAnime>();
        const malToAniListId = yield* resolveMalToAniListIdMap(jikanMetadata, manami);
        const mergedMetadata = mergeAnimeMetadata({
          anilist: baseMetadata,
          ...(Option.isSome(jikanMetadata) ? { jikan: jikanMetadata.value } : {}),
          ...(malToAniListId === undefined ? {} : { malToAniListId }),
          ...(Option.isSome(manamiMetadata) ? { manami: manamiMetadata.value } : {}),
        });

        const cacheState = yield* enrichmentService.getAniDbCacheState(mergedMetadata.id);

        if (cacheState._tag === "Fresh") {
          return yield* toFreshLookupResult(mergedMetadata, cacheState);
        }

        yield* enrichmentService.requestAniDbRefresh({
          mediaId: mergedMetadata.id,
          unitCount: mergedMetadata.unitCount,
          synonyms: mergedMetadata.synonyms,
          title: mergedMetadata.title,
        });

        const result = {
          _tag: "Found",
          enrichment: {
            _tag: "Degraded",
            reason: {
              _tag: "AniDbRefreshPending",
              cacheState: cacheState._tag === "Missing" ? "missing" : "stale",
            },
          },
          metadata: mergedMetadata,
        } as const satisfies MediaMetadataLookupResult;

        yield* logEnrichmentResult(mergedMetadata.id, result.enrichment);
        return result;
      },
    );

    const getSeasonalAnime = Effect.fn("MediaMetadataProviderService.getSeasonalAnime")(
      function* (input: { season: MediaSeason; year: number; limit: number; page: number }) {
        return yield* seasonalWithFallback({
          aniList,
          jikan,
          manami,
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
        manami,
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

export class MediaMetadataProviderService extends Effect.Service<MediaMetadataProviderService>()(
  "@bakarr/api/MediaMetadataProviderService",
  {
    // AniList/Jikan/Manami clients come from the lifecycle layer.
    dependencies: [MediaMetadataEnrichmentService.Default],
    effect: makeMediaMetadataProviderService(),
  },
) {}

export const MediaMetadataProviderServiceLive = MediaMetadataProviderService.Default;

const toFreshLookupResult = Effect.fn("MediaMetadataProviderService.toFreshLookupResult")(
  function* (
    baseMetadata: AnimeMetadata,
    cacheState: Extract<MediaMetadataEnrichmentCacheState, { _tag: "Fresh" }>,
  ) {
    const mergedEpisodes = mergeLookupEpisodes(baseMetadata, cacheState);

    if (cacheState.mediaUnits.length === 0) {
      const result = {
        _tag: "Found",
        enrichment: {
          _tag: "Degraded",
          reason: {
            _tag: "AniDbNoEpisodeMetadata",
          },
        },
        metadata: baseMetadata,
      } as const satisfies MediaMetadataLookupResult;

      yield* logEnrichmentResult(baseMetadata.id, result.enrichment);
      return result;
    }

    return {
      _tag: "Found",
      enrichment: {
        _tag: "Enriched",
        mediaUnits: cacheState.mediaUnits.length,
        provider: "AniDB",
      },
      metadata: {
        ...baseMetadata,
        mediaUnits: mergedEpisodes,
      },
    } as const satisfies MediaMetadataLookupResult;
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

interface ManamiMalIdResolver {
  readonly resolveAniListIdFromMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<number>, ExternalCallError>;
}

const resolveMalToAniListIdMap = Effect.fn("MediaMetadataProviderService.resolveMalToAniListIdMap")(
  function* (jikanMetadata: Option.Option<JikanNormalizedAnime>, manami: ManamiMalIdResolver) {
    if (Option.isNone(jikanMetadata)) {
      return undefined;
    }

    const recommendationMalIds = (jikanMetadata.value.recommendations ?? []).map(
      (recommendation) => recommendation.malId,
    );
    const uniqueMalIds = [
      ...new Set([
        ...jikanMetadata.value.relations.map((relation) => relation.malId),
        ...recommendationMalIds,
      ]),
    ];

    if (uniqueMalIds.length === 0) {
      return undefined;
    }

    const pairs = yield* Effect.forEach(
      uniqueMalIds,
      (malId) =>
        optionalExternalMetadataLookup(manami.resolveAniListIdFromMalId(malId), {
          malId,
          lookup: "resolveAniListIdFromMalId",
          provider: "Manami",
        }).pipe(Effect.map((mediaId) => [malId, mediaId] as const)),
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
    Effect.catchAll((error) =>
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
  readonly provider: "Jikan" | "Manami";
}
