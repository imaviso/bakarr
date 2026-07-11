import { Effect, Option } from "effect";

import type { MediaKind } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";
import {
  MediaMetadataEnrichmentService,
  type MediaMetadataEnrichmentCacheState,
} from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { mergeAnimeMetadataEpisodes } from "@/features/media/units/unit-merge.ts";
import type { StoredDataError } from "@/features/errors.ts";
import type { AniDbRuntimeConfigError } from "@/features/media/errors.ts";
import { JikanClient } from "@/features/media/metadata/jikan.ts";
import type { JikanNormalizedAnime } from "@/features/media/metadata/jikan-model.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import { mergeAnimeMetadata } from "@/features/media/metadata/metadata-merge.ts";
import { mediaKindFromAniListFormat } from "@/features/media/shared/media-kind.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";

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

    return { getAnimeMetadataById } satisfies MediaMetadataProviderServiceShape;
  },
);

export class MediaMetadataProviderService extends Effect.Service<MediaMetadataProviderService>()(
  "@bakarr/api/MediaMetadataProviderService",
  {
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
