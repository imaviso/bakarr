import { Effect, Option } from "effect";

import type { MediaKind } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";
import {
  AnimeMetadataEnrichmentService,
  type AnimeMetadataEnrichmentCacheState,
} from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { mergeAnimeMetadataEpisodes } from "@/features/media/units/unit-merge.ts";
import type { AniDbRuntimeConfigError, MediaStoredDataError } from "@/features/media/errors.ts";
import { JikanClient } from "@/features/media/metadata/jikan.ts";
import type { JikanNormalizedAnime } from "@/features/media/metadata/jikan-model.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import { mergeAnimeMetadata } from "@/features/media/metadata/metadata-merge.ts";
import { mediaKindFromAniListFormat } from "@/features/media/shared/media-kind.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";

export type AnimeMetadataLookupResult =
  | {
      readonly _tag: "NotFound";
    }
  | {
      readonly _tag: "Found";
      readonly enrichment: AnimeMetadataEnrichmentResult;
      readonly metadata: AnimeMetadata;
    };

export type AnimeMetadataEnrichmentResult =
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
  | MediaStoredDataError
  | AniDbRuntimeConfigError;

export interface AnimeMetadataProviderServiceShape {
  readonly getAnimeMetadataById: (
    id: number,
    mediaKind?: MediaKind,
  ) => Effect.Effect<AnimeMetadataLookupResult, AnimeMetadataLookupError>;
}

const makeAnimeMetadataProviderService = Effect.fn("AnimeMetadataProviderService.make")(
  function* () {
    const aniList = yield* AniListClient;
    const jikan = yield* JikanClient;
    const manami = yield* ManamiClient;
    const enrichmentService = yield* AnimeMetadataEnrichmentService;

    const getAnimeMetadataById = Effect.fn("AnimeMetadataProviderService.getAnimeMetadataById")(
      function* (id: number, mediaKind?: MediaKind) {
        const metadata = yield* aniList.getAnimeMetadataById(id, mediaKind);

        if (Option.isNone(metadata)) {
          return { _tag: "NotFound" } as const satisfies AnimeMetadataLookupResult;
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
          } as const satisfies AnimeMetadataLookupResult;
        }

        const manamiMetadata = yield* optionalManamiLookup(manami.getByAniListId(baseMetadata.id), {
          mediaId: baseMetadata.id,
          lookup: "getByAniListId",
        });

        const effectiveMalId =
          baseMetadata.malId === undefined
            ? yield* optionalManamiLookup(manami.resolveMalIdFromAniListId(baseMetadata.id), {
                mediaId: baseMetadata.id,
                lookup: "resolveMalIdFromAniListId",
              })
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
          ? yield* jikan.getAnimeByMalId(effectiveMalId.value)
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
        } as const satisfies AnimeMetadataLookupResult;

        yield* logEnrichmentResult(mergedMetadata.id, result.enrichment);
        return result;
      },
    );

    return { getAnimeMetadataById } satisfies AnimeMetadataProviderServiceShape;
  },
);

export class AnimeMetadataProviderService extends Effect.Service<AnimeMetadataProviderService>()(
  "@bakarr/api/AnimeMetadataProviderService",
  {
    effect: makeAnimeMetadataProviderService(),
  },
) {}

export const AnimeMetadataProviderServiceLive = AnimeMetadataProviderService.Default;

const toFreshLookupResult = Effect.fn("AnimeMetadataProviderService.toFreshLookupResult")(
  function* (
    baseMetadata: AnimeMetadata,
    cacheState: Extract<AnimeMetadataEnrichmentCacheState, { _tag: "Fresh" }>,
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
      } as const satisfies AnimeMetadataLookupResult;

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
    } as const satisfies AnimeMetadataLookupResult;
  },
);

const mergeLookupEpisodes = (
  metadata: AnimeMetadata,
  cacheState: Extract<AnimeMetadataEnrichmentCacheState, { _tag: "Fresh" }>,
): AnimeMetadata["mediaUnits"] => {
  return mergeAnimeMetadataEpisodes(metadata.mediaUnits, cacheState.mediaUnits);
};

const logEnrichmentResult = Effect.fn("AnimeMetadataProviderService.logEnrichmentResult")(
  function* (mediaId: number, result: AnimeMetadataEnrichmentResult) {
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

const resolveMalToAniListIdMap = Effect.fn("AnimeMetadataProviderService.resolveMalToAniListIdMap")(
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
        optionalManamiLookup(manami.resolveAniListIdFromMalId(malId), {
          malId,
          lookup: "resolveAniListIdFromMalId",
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

function optionalManamiLookup<A>(
  effect: Effect.Effect<Option.Option<A>, ExternalCallError>,
  annotations: ManamiLookupAnnotations,
): Effect.Effect<Option.Option<A>> {
  return effect.pipe(
    Effect.catchAll((error) =>
      Effect.logWarning("Manami lookup degraded").pipe(
        Effect.annotateLogs({
          ...annotations,
          error: error.message,
          operation: error.operation,
          provider: "Manami",
        }),
        Effect.as(Option.none<A>()),
      ),
    ),
  );
}

interface ManamiLookupAnnotations {
  readonly lookup: string;
  readonly malId?: number;
  readonly mediaId?: number;
}
