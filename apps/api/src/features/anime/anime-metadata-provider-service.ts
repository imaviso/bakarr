import { Context, Effect, Layer, Option } from "effect";

import { AniDbClient } from "@/features/anime/anidb.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import type { AnimeMetadata } from "@/features/anime/anilist-model.ts";
import type {
  AniDbEpisodeLookupResult,
  AniDbLookupSkipReason,
} from "@/features/anime/anidb-types.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";

const ANIDB_ENRICHMENT_TIMEOUT_MS = 1500;

type AniDbLookupOrFailure =
  | AniDbEpisodeLookupResult
  | {
      readonly _tag: "AniDbLookupFailed";
      readonly message: string;
      readonly operation: string;
    };

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
      readonly _tag: "AniDbSkipped";
      readonly reason: AniDbLookupSkipReason;
    }
  | {
      readonly _tag: "AniDbTimeout";
      readonly timeoutMs: number;
    }
  | {
      readonly _tag: "AniDbExternalError";
      readonly message: string;
      readonly operation: string;
    }
  | {
      readonly _tag: "AniDbNoEpisodeMetadata";
    };

export interface AnimeMetadataProviderServiceShape {
  readonly getAnimeMetadataById: (
    id: number,
  ) => Effect.Effect<AnimeMetadataLookupResult, ExternalCallError>;
}

export class AnimeMetadataProviderService extends Context.Tag(
  "@bakarr/api/AnimeMetadataProviderService",
)<AnimeMetadataProviderService, AnimeMetadataProviderServiceShape>() {}

export const AnimeMetadataProviderServiceLive = Layer.effect(
  AnimeMetadataProviderService,
  Effect.gen(function* () {
    const aniList = yield* AniListClient;
    const aniDb = yield* AniDbClient;

    const getAnimeMetadataById = Effect.fn("AnimeMetadataProviderService.getAnimeMetadataById")(
      function* (id: number) {
        const metadata = yield* aniList.getAnimeMetadataById(id);

        if (Option.isNone(metadata)) {
          return { _tag: "NotFound" } as const satisfies AnimeMetadataLookupResult;
        }

        const baseMetadata = metadata.value;

        const lookup = yield* aniDb
          .getEpisodeMetadata({
            episodeCount: baseMetadata.episodeCount,
            synonyms: baseMetadata.synonyms,
            title: baseMetadata.title,
          })
          .pipe(
            Effect.map((value): AniDbLookupOrFailure => value),
            Effect.timeoutOption(`${ANIDB_ENRICHMENT_TIMEOUT_MS} millis`),
            Effect.catchTag("ExternalCallError", (error) =>
              Effect.succeed(
                Option.some<AniDbLookupOrFailure>({
                  _tag: "AniDbLookupFailed",
                  message: error.message,
                  operation: error.operation,
                }),
              ),
            ),
          );

        if (Option.isNone(lookup)) {
          const result = {
            _tag: "Found",
            enrichment: {
              _tag: "Degraded",
              reason: {
                _tag: "AniDbTimeout",
                timeoutMs: ANIDB_ENRICHMENT_TIMEOUT_MS,
              },
            },
            metadata: baseMetadata,
          } as const satisfies AnimeMetadataLookupResult;

          yield* logEnrichmentResult(id, result.enrichment);
          return result;
        }

        const lookupValue = lookup.value;

        if (lookupValue._tag === "AniDbLookupFailed") {
          const result = {
            _tag: "Found",
            enrichment: {
              _tag: "Degraded",
              reason: {
                _tag: "AniDbExternalError",
                message: lookupValue.message,
                operation: lookupValue.operation,
              },
            },
            metadata: baseMetadata,
          } as const satisfies AnimeMetadataLookupResult;

          yield* logEnrichmentResult(id, result.enrichment);
          return result;
        }

        return yield* buildFoundLookupResult(id, baseMetadata, lookupValue);
      },
    );

    return AnimeMetadataProviderService.of({ getAnimeMetadataById });
  }),
);

const buildFoundLookupResult = Effect.fn("AnimeMetadataProviderService.buildFoundLookupResult")(
  function* (animeId: number, baseMetadata: AnimeMetadata, lookup: AniDbEpisodeLookupResult) {
    if (lookup._tag === "AniDbLookupSkipped") {
      const result = {
        _tag: "Found",
        enrichment: {
          _tag: "Degraded",
          reason: {
            _tag: "AniDbSkipped",
            reason: lookup.reason,
          },
        },
        metadata: baseMetadata,
      } as const satisfies AnimeMetadataLookupResult;

      yield* logEnrichmentResult(animeId, result.enrichment);
      return result;
    }

    if (lookup.episodes.length === 0) {
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

      yield* logEnrichmentResult(animeId, result.enrichment);
      return result;
    }

    return {
      _tag: "Found",
      enrichment: {
        _tag: "Enriched",
        episodes: lookup.episodes.length,
        provider: "AniDB",
      },
      metadata: {
        ...baseMetadata,
        episodes: [...lookup.episodes],
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

    yield* Effect.logWarning("AniDB enrichment degraded").pipe(
      Effect.annotateLogs({
        animeId,
        reason: reason._tag,
        ...(reason._tag === "AniDbExternalError"
          ? {
              message: reason.message,
              operation: reason.operation,
            }
          : {}),
        ...(reason._tag === "AniDbSkipped" ? { skipReason: reason.reason } : {}),
        ...(reason._tag === "AniDbTimeout" ? { timeoutMs: reason.timeoutMs } : {}),
      }),
    );
  },
);
