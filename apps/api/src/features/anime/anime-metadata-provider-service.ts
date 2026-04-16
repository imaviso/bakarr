import { Context, Effect, Layer, Option } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import type { AnimeMetadata } from "@/features/anime/anilist-model.ts";
import {
  AnimeMetadataEnrichmentService,
  type AnimeMetadataEnrichmentCacheState,
} from "@/features/anime/anime-metadata-enrichment-service.ts";
import { mergeAnimeMetadataEpisodes } from "@/features/anime/episode-merge.ts";
import type { AniDbRuntimeConfigError, AnimeStoredDataError } from "@/features/anime/errors.ts";
import { JikanClient } from "@/features/anime/jikan.ts";
import type { JikanNormalizedAnime } from "@/features/anime/jikan-model.ts";
import { ManamiClient } from "@/features/anime/manami.ts";
import { mergeAnimeMetadata } from "@/features/anime/metadata-merge.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";

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
      readonly episodes: number;
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
  | AnimeStoredDataError
  | AniDbRuntimeConfigError;

export interface AnimeMetadataProviderServiceShape {
  readonly getAnimeMetadataById: (
    id: number,
  ) => Effect.Effect<AnimeMetadataLookupResult, AnimeMetadataLookupError>;
}

export class AnimeMetadataProviderService extends Context.Tag(
  "@bakarr/api/AnimeMetadataProviderService",
)<AnimeMetadataProviderService, AnimeMetadataProviderServiceShape>() {}

export const AnimeMetadataProviderServiceLive = Layer.effect(
  AnimeMetadataProviderService,
  Effect.gen(function* () {
    const aniList = yield* AniListClient;
    const jikan = yield* JikanClient;
    const manami = yield* ManamiClient;
    const enrichmentService = yield* AnimeMetadataEnrichmentService;

    const getAnimeMetadataById = Effect.fn("AnimeMetadataProviderService.getAnimeMetadataById")(
      function* (id: number) {
        const metadata = yield* aniList.getAnimeMetadataById(id);

        if (Option.isNone(metadata)) {
          return { _tag: "NotFound" } as const satisfies AnimeMetadataLookupResult;
        }

        const baseMetadata = metadata.value;
        const manamiMetadata = yield* manami.getByAniListId(baseMetadata.id);
        const effectiveMalId =
          baseMetadata.malId === undefined
            ? yield* manami.resolveMalIdFromAniListId(baseMetadata.id)
            : Option.some(baseMetadata.malId);

        if (baseMetadata.malId === undefined && Option.isSome(effectiveMalId)) {
          yield* Effect.logInfo("Resolved MAL id from Manami").pipe(
            Effect.annotateLogs({
              animeId: baseMetadata.id,
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
          animeId: mergedMetadata.id,
          episodeCount: mergedMetadata.episodeCount,
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

    return AnimeMetadataProviderService.of({ getAnimeMetadataById });
  }),
);

const toFreshLookupResult = Effect.fn("AnimeMetadataProviderService.toFreshLookupResult")(
  function* (
    baseMetadata: AnimeMetadata,
    cacheState: Extract<AnimeMetadataEnrichmentCacheState, { _tag: "Fresh" }>,
  ) {
    const mergedEpisodes = mergeLookupEpisodes(baseMetadata, cacheState);

    if (cacheState.episodes.length === 0) {
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
        episodes: cacheState.episodes.length,
        provider: "AniDB",
      },
      metadata: {
        ...baseMetadata,
        episodes: mergedEpisodes,
      },
    } as const satisfies AnimeMetadataLookupResult;
  },
);

const mergeLookupEpisodes = (
  metadata: AnimeMetadata,
  cacheState: Extract<AnimeMetadataEnrichmentCacheState, { _tag: "Fresh" }>,
): AnimeMetadata["episodes"] => {
  return mergeAnimeMetadataEpisodes(metadata.episodes, cacheState.episodes);
};

const logEnrichmentResult = Effect.fn("AnimeMetadataProviderService.logEnrichmentResult")(
  function* (animeId: number, result: AnimeMetadataEnrichmentResult) {
    if (result._tag === "Enriched") {
      return;
    }

    const reason = result.reason;

    yield* Effect.logInfo("AniDB enrichment degraded").pipe(
      Effect.annotateLogs({
        animeId,
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
        manami
          .resolveAniListIdFromMalId(malId)
          .pipe(Effect.map((animeId) => [malId, animeId] as const)),
      { concurrency: 4 },
    );

    const output = new Map<number, number>();

    for (const [malId, animeId] of pairs) {
      if (Option.isSome(animeId)) {
        output.set(malId, animeId.value);
      }
    }

    return output.size > 0 ? output : undefined;
  },
);
