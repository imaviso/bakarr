import { Context, Effect, Layer, Option } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import type { AnimeMetadata } from "@/features/anime/anilist-model.ts";
import {
  AnimeMetadataEnrichmentService,
  type AnimeMetadataEnrichmentCacheState,
} from "@/features/anime/anime-metadata-enrichment-service.ts";
import type { AnimeStoredDataError } from "@/features/anime/errors.ts";
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

export type AnimeMetadataLookupError = ExternalCallError | DatabaseError | AnimeStoredDataError;

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
    const enrichmentService = yield* AnimeMetadataEnrichmentService;

    const getAnimeMetadataById = Effect.fn("AnimeMetadataProviderService.getAnimeMetadataById")(
      function* (id: number) {
        const metadata = yield* aniList.getAnimeMetadataById(id);

        if (Option.isNone(metadata)) {
          return { _tag: "NotFound" } as const satisfies AnimeMetadataLookupResult;
        }

        const baseMetadata = metadata.value;
        const cacheState = yield* enrichmentService.getAniDbCacheState(baseMetadata.id);

        if (cacheState._tag === "Fresh") {
          return yield* toFreshLookupResult(baseMetadata, cacheState);
        }

        yield* enrichmentService.requestAniDbRefresh({
          animeId: baseMetadata.id,
          episodeCount: baseMetadata.episodeCount,
          synonyms: baseMetadata.synonyms,
          title: baseMetadata.title,
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
          metadata: baseMetadata,
        } as const satisfies AnimeMetadataLookupResult;

        yield* logEnrichmentResult(baseMetadata.id, result.enrichment);
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
        episodes: [...cacheState.episodes],
      },
    } as const satisfies AnimeMetadataLookupResult;
  },
);

const logEnrichmentResult = Effect.fn("AnimeMetadataProviderService.logEnrichmentResult")(
  function* (animeId: number, result: AnimeMetadataEnrichmentResult) {
    if (result._tag === "Enriched") {
      return;
    }

    const reason = result.reason;

    yield* Effect.logInfo("AniDB enrichment degraded").pipe(
      Effect.annotateLogs({
        animeId,
        reason: reason._tag,
        ...(reason._tag === "AniDbRefreshPending" ? { cacheState: reason.cacheState } : {}),
      }),
    );
  },
);
