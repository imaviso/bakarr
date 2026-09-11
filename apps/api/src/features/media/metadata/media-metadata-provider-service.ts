import {
  brandMediaId,
  type MediaIdSpace,
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
import { mergeAnimeMetadata } from "@/features/media/metadata/metadata-merge.ts";
import {
  tenraiAnimeToMetadata,
  tenraiSeasonalEntryToSearchResult,
} from "@/features/media/metadata/tenrai-model.ts";
import { mediaKindFromAniListFormat } from "@/features/media/shared/media-kind.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import { AniListDetailCacheRepository } from "@/features/media/metadata/anilist-detail-cache-repository.ts";
import { ExternalIdMapRepository } from "@/features/media/metadata/external-id-map-repository.ts";
import type { ExternalIdMapping } from "@/features/media/metadata/external-id-map-repository.ts";
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
    tenrai: Pick<typeof TenraiClient.Service, "searchAnime">;
    query: string;
    mediaKind: MediaKind;
  }) {
    const anilistAttempt = yield* input.aniList
      .searchAnimeMetadata(input.query, input.mediaKind)
      .pipe(Effect.result);

    if (anilistAttempt._tag === "Success") {
      return {
        degraded: false,
        results: anilistAttempt.success.map(toMediaSearchResult),
      };
    }

    if (!shouldFallbackToSearch(anilistAttempt.failure)) {
      return yield* anilistAttempt.failure;
    }

    yield* Effect.logWarning("AniList search failed; using Tenrai fallback").pipe(
      Effect.annotateLogs({
        causeTag: anilistAttempt.failure._tag,
        operation: anilistAttempt.failure.operation,
        query: input.query,
      }),
    );

    // MAL IDs are canonical in Tenrai-served results; detail lookup resolves
    // either ID space back to one metadata record.
    const entries = yield* input.tenrai.searchAnime(input.query, 10);

    return {
      degraded: true,
      results: entries.map((entry) =>
        toMediaSearchResult(tenraiSeasonalEntryToSearchResult(entry)),
      ),
    };
  },
);

export const seasonalWithFallback = Effect.fn("MediaMetadata.seasonalWithFallback")(
  function* (input: {
    aniList: Pick<typeof AniListClient.Service, "getSeasonalAnime">;
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

    // MAL IDs are canonical in Tenrai-served results; detail lookup resolves
    // either ID space back to one metadata record, so no AniList mapping
    // filter here — dropping unmapped entries is what emptied discovery
    // during outages.
    const results = tenraiEntries.map((entry) =>
      toMediaSearchResult(
        tenraiSeasonalEntryToSearchResult(entry, { season: input.season, year: input.year }),
      ),
    );

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

// Fallback predicates cover transport/upstream failures only, deliberately:
// - `*.request` is a local request-encode bug — deterministic, retry pointless.
// - `*.ratelimit.config` is a local config failure — loud, not upstream.
// - `*.normalize` is upstream schema drift — loud so decoders get fixed.
// Detail lookups have their own stale-cache path for the same cases.
function shouldFallbackToSearch(error: ExternalCallError) {
  return error.operation === "anilist.search" || error.operation === "anilist.search.response";
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
    idSpace?: MediaIdSpace,
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
      function* (id: number, mediaKind?: MediaKind, idSpace?: MediaIdSpace) {
        // One number, two spaces: the map disambiguates known ids, the caller
        // declares the space for fresh search-result ids, and anything else
        // bootstraps via AniList (whose idMal is the exact MAL bridge). No
        // provider is ever queried with a number from the other space.
        const known = yield* loadKnownMapping(idMap, id);
        const space =
          idSpace ??
          (Option.isSome(known) ? (known.value.anilistId === id ? "anilist" : "mal") : undefined);

        if (space === "mal") {
          return yield* malSpaceLookup({ id, known, mediaKind });
        }

        if (space === "anilist") {
          return yield* anilistSpaceLookup({ id, known, mediaKind });
        }

        return yield* unknownSpaceLookup({ id, mediaKind });
      },
    );

    const getSeasonalAnime = Effect.fn("MediaMetadataProviderService.getSeasonalAnime")(
      function* (input: { season: MediaSeason; year: number; limit: number; page: number }) {
        return yield* seasonalWithFallback({
          aniList,
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
        tenrai,
      });
    });

    const anilistSpaceLookup = Effect.fn("MediaMetadataProviderService.anilistSpaceLookup")(
      function* (input: {
        id: number;
        known: Option.Option<ExternalIdMapping>;
        mediaKind: MediaKind | undefined;
      }) {
        // Counterpart MAL only from an AniList-side row; a MAL-side row with
        // the same number is a different show, never reuse it.
        const rowMalId =
          Option.isSome(input.known) && input.known.value.anilistId === input.id
            ? input.known.value.malId
            : undefined;

        const anilistAttempt = yield* getCachedOrRemoteDetail({
          aniList,
          detailCache,
          id: input.id,
          mediaKind: input.mediaKind,
        }).pipe(Effect.result);

        let tenraiMetadata: Option.Option<TenraiNormalizedAnime> = Option.none();
        let tenraiFailure: ExternalCallError | undefined;

        if (rowMalId !== undefined) {
          const tenraiAttempt = yield* tenrai.getAnimeByMalId(rowMalId).pipe(Effect.result);

          if (tenraiAttempt._tag === "Failure") {
            tenraiFailure = tenraiAttempt.failure;
          } else {
            tenraiMetadata = tenraiAttempt.success;
          }
        }

        if (anilistAttempt._tag === "Failure") {
          // AniList is primary here: Tenrai-only serves when the MAL side is
          // map-known, otherwise the failure surfaces (never guess a MAL id).
          if (rowMalId !== undefined && Option.isSome(tenraiMetadata)) {
            return yield* finishTenraiOnlyLookup(tenraiMetadata.value, input.mediaKind, MAP_ONLY);
          }

          if (tenraiFailure !== undefined) {
            return yield* tenraiFailure;
          }

          return yield* anilistAttempt.failure;
        }

        if (Option.isNone(anilistAttempt.success)) {
          return { _tag: "NotFound" } satisfies MediaMetadataLookupResult;
        }

        const detail = anilistAttempt.success.value;

        // AniList hits may carry an idMal the map did not know yet: one
        // follow-up Tenrai lookup so synopsis/relations still merge.
        if (Option.isNone(tenraiMetadata) && detail.data.malId !== undefined) {
          tenraiMetadata = yield* optionalExternalMetadataLookup(
            tenrai.getAnimeByMalId(detail.data.malId),
            {
              lookup: "getAnimeByMalId",
              malId: detail.data.malId,
              mediaId: input.id,
              provider: "Tenrai",
            },
          );
        }

        const matched = matchTenraiToMalId(tenraiMetadata, detail.data.malId);

        if (Option.isSome(tenraiMetadata) && Option.isNone(matched)) {
          yield* Effect.logWarning("Tenrai record mismatches AniList; dropping enrichment").pipe(
            Effect.annotateLogs({
              anilistId: input.id,
              anilistMalId: detail.data.malId,
              tenraiMalId: tenraiMetadata.value.malId,
            }),
          );
        }

        return yield* finishAnilistBaseLookup({
          baseMetadata: detail.data,
          detailOrigin: detail.origin,
          mediaKind: input.mediaKind,
          remote: aniList,
          skipUpsert: Option.isSome(tenraiMetadata) && Option.isNone(matched),
          tenraiMetadata: matched,
        });
      },
    );

    const malSpaceLookup = Effect.fn("MediaMetadataProviderService.malSpaceLookup")(
      function* (input: {
        id: number;
        known: Option.Option<ExternalIdMapping>;
        mediaKind: MediaKind | undefined;
      }) {
        // AniList counterpart only from a MAL-side row; an AniList-side row
        // with the same number is a different show, never reuse it.
        const rowAnilistId =
          Option.isSome(input.known) && input.known.value.malId === input.id
            ? input.known.value.anilistId
            : undefined;

        const tenraiAttempt = yield* tenrai.getAnimeByMalId(input.id).pipe(Effect.result);

        let anilistDetail: Option.Option<CachedAnimeDetail> = Option.none();
        let anilistFailure: ExternalCallError | DatabaseError | undefined;

        if (rowAnilistId !== undefined) {
          const anilistAttempt = yield* getCachedOrRemoteDetail({
            aniList,
            detailCache,
            id: rowAnilistId,
            mediaKind: input.mediaKind,
          }).pipe(Effect.result);

          if (anilistAttempt._tag === "Failure") {
            anilistFailure = anilistAttempt.failure;
          } else {
            anilistDetail = anilistAttempt.success;
          }
        }

        // A stale row can point at an AniList record for another show: the
        // row's MAL id wins, the AniList side is dropped, never merged.
        if (Option.isSome(anilistDetail)) {
          const claimed = anilistDetail.value.data.malId;

          if (claimed !== undefined && claimed !== input.id) {
            yield* Effect.logWarning(
              "AniList detail disagrees with MAL mapping; using Tenrai",
            ).pipe(
              Effect.annotateLogs({
                anilistId: rowAnilistId,
                anilistMalId: claimed,
                malId: input.id,
              }),
            );
            anilistDetail = Option.none();
          }
        }

        if (Option.isSome(anilistDetail)) {
          const detail = anilistDetail.value;
          const tenraiMetadata =
            tenraiAttempt._tag === "Success"
              ? tenraiAttempt.success
              : Option.none<TenraiNormalizedAnime>();

          return yield* finishAnilistBaseLookup({
            baseMetadata: detail.data,
            detailOrigin: detail.origin,
            mediaKind: input.mediaKind,
            remote: aniList,
            skipUpsert: false,
            tenraiMetadata,
          });
        }

        const tenraiOnly =
          tenraiAttempt._tag === "Success"
            ? Option.getOrUndefined(tenraiAttempt.success)
            : undefined;

        if (tenraiOnly !== undefined) {
          // Relations resolve upstream only when AniList answered; otherwise
          // learned rows only, never doomed upstream resolves while down.
          const remote =
            rowAnilistId !== undefined && anilistFailure === undefined ? aniList : MAP_ONLY;
          return yield* finishTenraiOnlyLookup(tenraiOnly, input.mediaKind, remote);
        }

        if (tenraiAttempt._tag === "Failure") {
          return yield* tenraiAttempt.failure;
        }

        if (anilistFailure !== undefined) {
          return yield* anilistFailure;
        }

        return { _tag: "NotFound" } satisfies MediaMetadataLookupResult;
      },
    );

    const unknownSpaceLookup = Effect.fn("MediaMetadataProviderService.unknownSpaceLookup")(
      function* (input: { id: number; mediaKind: MediaKind | undefined }) {
        // Bootstrap via AniList only; its idMal is the exact bridge to Tenrai.
        // Tenrai is never probed with the raw number here: without a trusted
        // MAL id that probe returns a different show, not a fallback.
        const anilistAttempt = yield* getCachedOrRemoteDetail({
          aniList,
          detailCache,
          id: input.id,
          mediaKind: input.mediaKind,
        }).pipe(Effect.result);

        if (anilistAttempt._tag === "Failure") {
          return yield* anilistAttempt.failure;
        }

        if (Option.isNone(anilistAttempt.success)) {
          // Definitively no such AniList id, so the MAL reading is the only
          // one left. Served without map writes: equivalence is unproven.
          const tenraiMetadata = yield* optionalExternalMetadataLookup(
            tenrai.getAnimeByMalId(input.id),
            {
              lookup: "getAnimeByMalId",
              malId: input.id,
              mediaId: input.id,
              provider: "Tenrai",
            },
          );

          const tenraiOnly = Option.getOrUndefined(tenraiMetadata);

          if (tenraiOnly === undefined) {
            return { _tag: "NotFound" } satisfies MediaMetadataLookupResult;
          }

          // AniList answered (no such id), so upstream relation resolution is fine.
          return yield* finishTenraiOnlyLookup(tenraiOnly, input.mediaKind, aniList);
        }

        const detail = anilistAttempt.success.value;
        let tenraiMetadata: Option.Option<TenraiNormalizedAnime> = Option.none();

        if (detail.data.malId !== undefined) {
          tenraiMetadata = yield* optionalExternalMetadataLookup(
            tenrai.getAnimeByMalId(detail.data.malId),
            {
              lookup: "getAnimeByMalId",
              malId: detail.data.malId,
              mediaId: input.id,
              provider: "Tenrai",
            },
          );
        }

        const matched = matchTenraiToMalId(tenraiMetadata, detail.data.malId);

        if (Option.isSome(tenraiMetadata) && Option.isNone(matched)) {
          yield* Effect.logWarning("Tenrai record mismatches AniList; dropping enrichment").pipe(
            Effect.annotateLogs({
              anilistId: input.id,
              anilistMalId: detail.data.malId,
              tenraiMalId: tenraiMetadata.value.malId,
            }),
          );
        }

        return yield* finishAnilistBaseLookup({
          baseMetadata: detail.data,
          detailOrigin: detail.origin,
          mediaKind: input.mediaKind,
          remote: aniList,
          skipUpsert: Option.isSome(tenraiMetadata) && Option.isNone(matched),
          tenraiMetadata: matched,
        });
      },
    );

    const finishAnilistBaseLookup = Effect.fn(
      "MediaMetadataProviderService.finishAnilistBaseLookup",
    )(function* (input: {
      baseMetadata: AnimeMetadata;
      detailOrigin: AnimeDetailOrigin;
      mediaKind: MediaKind | undefined;
      remote: MalIdResolver;
      skipUpsert: boolean;
      tenraiMetadata: Option.Option<TenraiNormalizedAnime>;
    }) {
      const effectiveMediaKind =
        input.mediaKind ?? mediaKindFromAniListFormat(input.baseMetadata.format);
      if (effectiveMediaKind !== "anime") {
        return {
          _tag: "Found",
          detailOrigin: input.detailOrigin,
          enrichment: {
            _tag: "Degraded",
            reason: { _tag: "AniDbNoEpisodeMetadata" },
          },
          metadata: input.baseMetadata,
        } satisfies MediaMetadataLookupResult;
      }

      const malToAniListId = yield* resolveMalToAniListIdMap(
        input.tenraiMetadata,
        idMap,
        input.remote,
      );
      const mergedMetadata = canonicalizeToMalId(
        mergeAnimeMetadata({
          anilist: input.baseMetadata,
          ...(Option.isSome(input.tenraiMetadata) ? { tenrai: input.tenraiMetadata.value } : {}),
          ...(malToAniListId === undefined ? {} : { malToAniListId }),
        }),
        input.tenraiMetadata,
      );

      // Mismatched (dropped) enrichment never persists its pairing: the map
      // only learns exact idMal bridges and validated matches.
      if (mergedMetadata.malId !== undefined && !input.skipUpsert) {
        yield* idMap.upsert({ anilistId: input.baseMetadata.id, malId: mergedMetadata.malId }).pipe(
          Effect.catch((error) =>
            Effect.logWarning("External id map store degraded").pipe(
              Effect.annotateLogs({
                anilistId: input.baseMetadata.id,
                error: error.message,
                malId: mergedMetadata.malId,
              }),
            ),
          ),
        );
      }

      return yield* finishEnrichedLookup(enrichmentService, {
        detailOrigin: input.detailOrigin,
        metadata: mergedMetadata,
      });
    });

    const finishTenraiOnlyLookup = Effect.fn("MediaMetadataProviderService.finishTenraiOnlyLookup")(
      function* (
        tenraiOnly: TenraiNormalizedAnime,
        mediaKind: MediaKind | undefined,
        remote: MalIdResolver,
      ) {
        const baseMetadata = tenraiAnimeToMetadata(tenraiOnly);
        const effectiveMediaKind = mediaKind ?? mediaKindFromAniListFormat(baseMetadata.format);
        if (effectiveMediaKind !== "anime") {
          return {
            _tag: "Found",
            detailOrigin: "tenrai",
            enrichment: {
              _tag: "Degraded",
              reason: { _tag: "AniDbNoEpisodeMetadata" },
            },
            metadata: baseMetadata,
          } satisfies MediaMetadataLookupResult;
        }

        // Relations resolve against AniList when alive; failures degrade to
        // omission so a down AniList never fails Tenrai-served detail.
        const malToAniListId = yield* resolveMalToAniListIdMap(
          Option.some(tenraiOnly),
          idMap,
          remote,
        );
        const mergedMetadata = mergeAnimeMetadata({
          anilist: baseMetadata,
          tenrai: tenraiOnly,
          ...(malToAniListId === undefined ? {} : { malToAniListId }),
        });

        return yield* finishEnrichedLookup(enrichmentService, {
          detailOrigin: "tenrai",
          metadata: mergedMetadata,
        });
      },
    );

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

// MAL IDs are canonical: Tenrai-served records already carry them, merged
// records take Tenrai's malId first, then AniList's idMal.
function canonicalizeToMalId(
  metadata: AnimeMetadata,
  tenrai: Option.Option<TenraiNormalizedAnime>,
): AnimeMetadata {
  const malId = (Option.isSome(tenrai) ? tenrai.value.malId : undefined) ?? metadata.malId;

  if (malId === undefined) {
    return metadata;
  }

  return { ...metadata, id: malId, malId };
}

// One number, two spaces: a single dual-side lookup disambiguates known ids.
// Callers project the side they need instead of maintaining separate
// check-anilist-then-mal copies.
const loadKnownMapping = Effect.fn("MediaMetadata.loadKnownMapping")(function* (
  idMap: Pick<typeof ExternalIdMapRepository.Service, "loadByEitherId">,
  id: number,
) {
  return yield* idMap
    .loadByEitherId(id)
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("External id map lookup degraded").pipe(
          Effect.annotateLogs({ error: error.message, mediaId: id }),
          Effect.as(Option.none()),
        ),
      ),
    );
});

// Cross-validation: the same number can name different shows in each space.
// Keeps the Tenrai record only when it agrees with the trusted MAL id, so a
// coincidental AniList hit can never chimera-merge an unrelated show.
function matchTenraiToMalId(
  tenrai: Option.Option<TenraiNormalizedAnime>,
  trustedMalId: number | undefined,
): Option.Option<TenraiNormalizedAnime> {
  if (Option.isNone(tenrai) || trustedMalId === undefined) {
    return tenrai;
  }

  return tenrai.value.malId === trustedMalId ? tenrai : Option.none();
}

const finishEnrichedLookup = Effect.fn("MediaMetadataProviderService.finishEnrichedLookup")(
  function* (
    enrichmentService: typeof MediaMetadataEnrichmentService.Service,
    input: {
      detailOrigin: AnimeDetailOrigin;
      metadata: AnimeMetadata;
    },
  ) {
    const cacheState = yield* enrichmentService.getAniDbCacheState(input.metadata.id);

    if (cacheState._tag === "Fresh") {
      return yield* toFreshLookupResult(input.metadata, cacheState, input.detailOrigin);
    }

    yield* enrichmentService.requestAniDbRefresh({
      mediaId: input.metadata.id,
      unitCount: input.metadata.unitCount,
      synonyms: input.metadata.synonyms,
      title: input.metadata.title,
    });

    const result: MediaMetadataLookupResult = {
      _tag: "Found",
      detailOrigin: input.detailOrigin,
      enrichment: {
        _tag: "Degraded",
        reason: {
          _tag: "AniDbRefreshPending",
          cacheState: cacheState._tag === "Missing" ? "missing" : "stale",
        },
      },
      metadata: input.metadata,
    };

    yield* logEnrichmentResult(input.metadata.id, result.enrichment);
    return result;
  },
);

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

// Map-only resolver: used once AniList has demonstrably failed, so relation
// mapping degrades to learned rows instead of firing doomed upstream
// resolves (each with its own retry schedule) per relation.
const MAP_ONLY: MalIdResolver = {
  resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
};

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
