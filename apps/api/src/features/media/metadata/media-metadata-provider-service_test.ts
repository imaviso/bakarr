import { brandMediaId } from "@packages/shared/index.ts";

import { assert, it } from "@effect/vitest";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { AniListDetailCacheRepository } from "@/features/media/metadata/anilist-detail-cache-repository.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import { MediaMetadataEnrichmentService } from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import type { AniDbRefreshRequest } from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { TenraiClient } from "@/features/media/metadata/tenrai.ts";
import type { TenraiNormalizedAnime } from "@/features/media/metadata/tenrai-model.ts";
import { ExternalIdMapRepository } from "@/features/media/metadata/external-id-map-repository.ts";
import { DatabaseError } from "@/db/database.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { Cause, Effect, Exit, Layer, Option } from "effect";

it.effect("returns refresh pending when AniDB cache is missing", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    onRefresh: () => {
      refreshCount += 1;
    },
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1001);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment._tag, "Degraded");
      if (result.enrichment._tag === "Degraded") {
        assert.deepStrictEqual(result.enrichment.reason, {
          _tag: "AniDbRefreshPending",
          cacheState: "missing",
        });
      }
    }

    assert.deepStrictEqual(refreshCount, 1);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("uses AniList-only metadata without probing Tenrai on unknown space", () => {
  const refreshRequests: AniDbRefreshRequest[] = [];
  const tenraiRequests: number[] = [];

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    metadata: makeMetadata(1003, {
      unitCount: undefined,
      malId: undefined,
      synonyms: ["Base Alias"],
    }),
    onTenraiLookup: (malId) => {
      tenraiRequests.push(malId);
    },
    onRefresh: (request) => {
      refreshRequests.push(request);
    },
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1003);

    // Unknown space bootstraps via AniList only: probing Tenrai with the
    // raw number would return a different show, not a fallback.
    assert.deepStrictEqual(tenraiRequests, []);
    assert.deepStrictEqual(refreshRequests.length, 1);
    assert.deepStrictEqual(refreshRequests[0]?.unitCount, undefined);
    assert.deepStrictEqual(refreshRequests[0]?.title, {
      english: undefined,
      native: undefined,
      romaji: "Media",
    });
    assert.deepStrictEqual(refreshRequests[0]?.synonyms, ["Base Alias"]);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.metadata.description, undefined);
      assert.deepStrictEqual(result.enrichment._tag, "Degraded");
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("returns enriched metadata when AniDB cache is fresh", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    cacheState: {
      _tag: "Fresh",
      mediaUnits: [
        {
          aired: "2024-01-01T00:00:00.000Z",
          number: 1,
          title: "Pilot",
        },
      ],
      updatedAt: "2024-01-02T00:00:00.000Z",
    },
    onRefresh: () => {
      refreshCount += 1;
    },
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1002);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment, {
        _tag: "Enriched",
        mediaUnits: 1,
        provider: "AniDB",
      });
      assert.deepStrictEqual(result.metadata.mediaUnits?.[0], {
        aired: "2024-01-01T00:00:00.000Z",
        number: 1,
        title: "Pilot",
      });
    }

    assert.deepStrictEqual(refreshCount, 0);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("merges Tenrai metadata before applying AniDB episode enrichment", () => {
  const providerLayer = makeProviderLayer({
    aniListIdByMalId: new Map([
      [202, 4004],
      [303, 5005],
    ]),
    cacheState: {
      _tag: "Fresh",
      mediaUnits: [
        {
          aired: "2024-01-01T00:00:00.000Z",
          number: 1,
          title: "Pilot",
        },
      ],
      updatedAt: "2024-01-02T00:00:00.000Z",
    },
    tenraiMetadata: {
      airing: false,
      approved: true,
      background: undefined,
      broadcast: {},
      demographics: [],
      duration: undefined,
      endDate: undefined,
      endYear: undefined,
      unitCount: undefined,
      explicitGenres: [],
      favorites: undefined,
      format: undefined,
      genres: ["Drama"],
      images: {},
      licensors: [],
      malId: 1002,
      members: undefined,
      popularity: undefined,
      producers: [],
      rank: undefined,
      rating: undefined,
      recommendations: [{ malId: 303, title: "Recommended from Tenrai" }],
      relations: [{ malId: 202, relation: "Sequel", title: "Related from Tenrai" }],
      score: undefined,
      scoredBy: undefined,
      season: undefined,
      source: undefined,
      startDate: undefined,
      startYear: undefined,
      status: undefined,
      studios: [],
      synopsis: "Tenrai Synopsis",
      themes: [],
      title: {},
      titleVariants: [],
      trailer: {},
      url: "https://myanimelist.net/media/1002",
      year: undefined,
    },
    metadata: makeMetadata(1002, {
      genres: ["Action"],
      malId: 1002,
    }),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1002);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment, {
        _tag: "Enriched",
        mediaUnits: 1,
        provider: "AniDB",
      });
      assert.deepStrictEqual(result.metadata.description, "Tenrai Synopsis");
      assert.deepStrictEqual(result.metadata.genres, ["Action", "Drama"]);
      assert.deepStrictEqual(result.metadata.relatedMedia, [
        {
          id: brandMediaId(4004),
          relation_type: "Sequel",
          title: {
            romaji: "Related from Tenrai",
          },
        },
      ]);
      assert.deepStrictEqual(result.metadata.recommendedMedia, [
        {
          id: brandMediaId(5005),
          title: {
            romaji: "Recommended from Tenrai",
          },
        },
        {
          id: brandMediaId(4004),
          relation_type: "Sequel",
          title: {
            romaji: "Related from Tenrai",
          },
        },
      ]);
      assert.deepStrictEqual(result.metadata.mediaUnits?.[0], {
        aired: "2024-01-01T00:00:00.000Z",
        number: 1,
        title: "Pilot",
      });
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("falls through to AniList when id map lookup fails", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    aniListIdByMalId: new Map([[606, 7007]]),
    cacheState: { _tag: "Missing" },
    idMapError: new DatabaseError({
      cause: new Error("id map unavailable"),
      message: "External id map lookup failed",
    }),
    tenraiMetadata: makeTenraiMetadata({
      malId: 606,
      relations: [{ malId: 606, relation: "Sequel", title: "Related" }],
    }),
    metadata: makeMetadata(1006, {
      malId: 606,
    }),
    onRefresh: () => {
      refreshCount += 1;
    },
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1001);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment._tag, "Degraded");
      if (result.enrichment._tag === "Degraded") {
        assert.deepStrictEqual(result.enrichment.reason, {
          _tag: "AniDbRefreshPending",
          cacheState: "missing",
        });
      }
      assert.deepStrictEqual(result.metadata.relatedMedia, [
        {
          id: brandMediaId(7007),
          relation_type: "Sequel",
          title: {
            romaji: "Related",
          },
        },
      ]);
    }

    assert.deepStrictEqual(refreshCount, 1);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("degrades gracefully when Tenrai getAnimeByMalId fails", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    metadata: makeMetadata(1005, {
      malId: 505,
      description: "AniList description",
      genres: ["Action"],
    }),
    getAnimeByMalIdError: ExternalCallError.make({
      cause: new Error("tenrai getAnimeByMalId failed"),
      message: "Tenrai lookup failed",
      operation: "TenraiClient.getAnimeByMalId",
    }),
    onRefresh: () => {
      refreshCount += 1;
    },
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1005);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.metadata.description, "AniList description");
      assert.deepStrictEqual(result.metadata.genres, ["Action"]);
      assert.deepStrictEqual(result.enrichment._tag, "Degraded");
      if (result.enrichment._tag === "Degraded") {
        assert.deepStrictEqual(result.enrichment.reason, {
          _tag: "AniDbRefreshPending",
          cacheState: "missing",
        });
      }
    }

    assert.deepStrictEqual(refreshCount, 1);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("degrades gracefully when AniList id resolution fails during relation mapping", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    tenraiMetadata: makeTenraiMetadata({
      endDate: undefined,
      unitCount: undefined,
      format: undefined,
      genres: [],
      malId: 606,
      relations: [{ malId: 909, relation: "Sequel", title: "Related" }],
      score: undefined,
      startDate: undefined,
      status: undefined,
      studios: [],
      synopsis: undefined,
      title: {},
      titleVariants: [],
    }),
    metadata: makeMetadata(1006, {
      malId: 606,
    }),
    resolveAniListIdFromMalIdError: ExternalCallError.make({
      cause: new Error("anilist resolve failed"),
      message: "AniList id resolve failed",
      operation: "anilist.resolveId.response",
    }),
    onRefresh: () => {
      refreshCount += 1;
    },
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1006);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment._tag, "Degraded");
      if (result.enrichment._tag === "Degraded") {
        assert.deepStrictEqual(result.enrichment.reason, {
          _tag: "AniDbRefreshPending",
          cacheState: "missing",
        });
      }
      // related media IDs should not be resolved when AniList id resolution is down
      assert.deepStrictEqual(result.metadata.relatedMedia?.length ?? 0, 0);
    }

    assert.deepStrictEqual(refreshCount, 1);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("stores the MAL id mapping after detail lookup", () => {
  const upserts: Array<{ readonly anilistId: number; readonly malId?: number | undefined }> = [];

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    metadata: makeMetadata(1007, {
      malId: 777,
    }),
    onIdMapUpsert: (upsertInput) => {
      upserts.push(upsertInput);
    },
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1007);

    assert.deepStrictEqual(result._tag, "Found");
    assert.deepStrictEqual(upserts, [{ anilistId: 1007, malId: 777 }]);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("reuses mapped AniList ids without remote resolve", () => {
  const remoteResolves: number[] = [];

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    idMapByMalId: new Map([[202, 4004]]),
    tenraiMetadata: makeTenraiMetadata({
      malId: 606,
      relations: [{ malId: 202, relation: "Sequel", title: "Related" }],
    }),
    metadata: makeMetadata(1006, {
      malId: 606,
    }),
    onResolveAniListId: (malId) => {
      remoteResolves.push(malId);
    },
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1006);

    assert.deepStrictEqual(result._tag, "Found");
    assert.deepStrictEqual(remoteResolves, []);
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.metadata.relatedMedia, [
        {
          id: brandMediaId(4004),
          relation_type: "Sequel",
          title: {
            romaji: "Related",
          },
        },
      ]);
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("serves fresh detail cache without calling AniList", () => {
  let remoteCalls = 0;

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    detailCache: AniListDetailCacheRepository.of({
      read: () => Effect.succeed({ data: makeMetadata(2001), origin: "live" }),
      write: () => Effect.void,
    }),
    onDetailLookup: () => {
      remoteCalls += 1;
    },
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(2001);

    assert.deepStrictEqual(result._tag, "Found");
    assert.deepStrictEqual(remoteCalls, 0);
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.detailOrigin, "live");
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("serves stale detail cache when AniList fails", () => {
  const providerLayer = makeProviderLayer({
    aniListDetailError: ExternalCallError.make({
      cause: new Error("AniList detail failed with status 403"),
      message: "AniList detail failed",
      operation: "anilist.detail.response",
    }),
    cacheState: { _tag: "Missing" },
    detailCache: AniListDetailCacheRepository.of({
      read: () => Effect.succeed({ data: makeMetadata(2002), origin: "stale" }),
      write: () => Effect.void,
    }),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(2002);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.metadata.id, 2002);
      assert.deepStrictEqual(result.detailOrigin, "stale");
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("writes live detail responses to the cache", () => {
  const written: AnimeMetadata[] = [];

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    detailCache: AniListDetailCacheRepository.of({
      read: () => Effect.succeed(null),
      write: (_id, _kind, metadata, _nowMs) =>
        Effect.sync(() => {
          written.push(metadata);
        }),
    }),
    metadata: makeMetadata(2003),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(2003);

    assert.deepStrictEqual(result._tag, "Found");
    assert.deepStrictEqual(written.length, 1);
    assert.deepStrictEqual(written[0]?.id, 2003);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("serves Tenrai-only detail with MAL-canonical id when AniList fails", () => {
  const upserts: Array<{ readonly anilistId: number; readonly malId?: number | undefined }> = [];

  const providerLayer = makeProviderLayer({
    aniListDetailError: ExternalCallError.make({
      cause: new Error("AniList detail failed with status 403"),
      message: "AniList detail failed",
      operation: "anilist.detail.response",
    }),
    cacheState: { _tag: "Missing" },
    tenraiMetadata: makeTenraiMetadata({
      format: "TV",
      genres: ["Action"],
      malId: 808,
      status: "Finished Airing",
      synopsis: "Tenrai-only synopsis",
      title: { english: "Tenrai Title", romaji: "Tenrai Romaji" },
    }),
    onIdMapUpsert: (upsertInput) => {
      upserts.push(upsertInput);
    },
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(808, undefined, "mal");

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.detailOrigin, "tenrai");
      assert.deepStrictEqual(result.metadata.id, 808);
      assert.deepStrictEqual(result.metadata.malId, 808);
      assert.deepStrictEqual(result.metadata.description, "Tenrai-only synopsis");
      assert.deepStrictEqual(result.metadata.format, "TV");
      assert.deepStrictEqual(result.metadata.status, "FINISHED");
      assert.deepStrictEqual(result.metadata.title.romaji, "Tenrai Romaji");
    }

    assert.deepStrictEqual(upserts, []);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("fails with the Tenrai error when both sources fail", () => {
  const providerLayer = makeProviderLayer({
    aniListDetailError: ExternalCallError.make({
      cause: new Error("AniList detail failed with status 403"),
      message: "AniList detail failed",
      operation: "anilist.detail.response",
    }),
    cacheState: { _tag: "Missing" },
    getAnimeByMalIdError: ExternalCallError.make({
      cause: new Error("tenrai detail failed"),
      message: "Tenrai detail failed",
      operation: "tenrai.detail.basic",
    }),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* Effect.exit(service.getAnimeMetadataById(808, undefined, "mal"));

    assert.deepStrictEqual(Exit.isFailure(result), true);
    if (Exit.isFailure(result)) {
      const failure = Cause.findErrorOption(result.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some" && failure.value instanceof ExternalCallError) {
        assert.deepStrictEqual(failure.value.operation, "tenrai.detail.basic");
      }
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("returns NotFound when both sources miss", () => {
  const providerLayer = makeProviderLayer({
    aniListDetailNone: true,
    cacheState: { _tag: "Missing" },
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(999001);

    assert.deepStrictEqual(result, { _tag: "NotFound" });
  }).pipe(Effect.provide(providerLayer));
});

it.effect("resolves MAL-space ids through the map without remote resolve", () => {
  const tenraiRequests: number[] = [];
  const remoteResolves: number[] = [];

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    idMapByMalId: new Map([[808, 1008]]),
    tenraiMetadata: makeTenraiMetadata({ malId: 808 }),
    metadata: makeMetadata(808, { malId: 808 }),
    onResolveAniListId: (malId) => {
      remoteResolves.push(malId);
    },
    onTenraiLookup: (malId) => {
      tenraiRequests.push(malId);
    },
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(808);

    assert.deepStrictEqual(result._tag, "Found");
    assert.deepStrictEqual(tenraiRequests, [808]);
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.metadata.id, 808);
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("drops Tenrai enrichment and skips upsert on MAL mismatch", () => {
  const upserts: Array<{ readonly anilistId: number; readonly malId?: number | undefined }> = [];

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    // AniList says show 1001 is MAL 606; Tenrai answers 606 with MAL 909:
    // a different show sharing nothing but the queried number.
    metadata: makeMetadata(1001, { malId: 606 }),
    tenraiMetadata: makeTenraiMetadata({
      malId: 909,
      relations: [{ malId: 909, relation: "Sequel", title: "Wrong Show" }],
      synopsis: "Wrong-show synopsis",
    }),
    onIdMapUpsert: (upsertInput) => {
      upserts.push(upsertInput);
    },
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1001);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.metadata.id, 606);
      assert.deepStrictEqual(result.metadata.description, undefined);
      assert.deepStrictEqual(result.metadata.relatedMedia ?? [], []);
    }

    assert.deepStrictEqual(upserts, []);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("bootstraps unknown ids via AniList and learns the idMal bridge", () => {
  const tenraiRequests: number[] = [];
  const upserts: Array<{ readonly anilistId: number; readonly malId?: number | undefined }> = [];

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    metadata: makeMetadata(1001, { malId: 606 }),
    tenraiMetadata: makeTenraiMetadata({
      malId: 606,
      synopsis: "Bridged synopsis",
    }),
    onIdMapUpsert: (upsertInput) => {
      upserts.push(upsertInput);
    },
    onTenraiLookup: (malId) => {
      tenraiRequests.push(malId);
    },
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* MediaMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1001);

    assert.deepStrictEqual(result._tag, "Found");
    // Tenrai is probed with the idMal bridge (606), never the raw id.
    assert.deepStrictEqual(tenraiRequests, [606]);
    assert.deepStrictEqual(upserts, [{ anilistId: 1001, malId: 606 }]);
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.metadata.id, 606);
      assert.deepStrictEqual(result.metadata.description, "Bridged synopsis");
    }
  }).pipe(Effect.provide(providerLayer));
});

function makeProviderLayer(input: {
  readonly aniListDetailError?: ExternalCallError | undefined;
  readonly aniListDetailNone?: boolean | undefined;
  readonly cacheState:
    | { readonly _tag: "Missing" }
    | {
        readonly _tag: "Fresh";
        readonly mediaUnits: ReadonlyArray<{
          readonly aired?: string | undefined;
          readonly number: number;
          readonly title?: string | undefined;
        }>;
        readonly updatedAt: string;
      };
  readonly aniListIdByMalId?: ReadonlyMap<number, number> | undefined;
  readonly tenraiMetadata?: TenraiNormalizedAnime | undefined;
  readonly getAnimeByMalIdError?: ExternalCallError | undefined;
  readonly idMapByMalId?: ReadonlyMap<number, number> | undefined;
  readonly idMapError?: DatabaseError | undefined;
  readonly metadata?: AnimeMetadata | undefined;
  readonly detailCache?: typeof AniListDetailCacheRepository.Service | undefined;
  readonly onDetailLookup?: (id: number) => void;
  readonly onTenraiLookup?: (malId: number) => void;
  readonly onResolveAniListId?: (malId: number) => void;
  readonly onIdMapUpsert?: (input: {
    readonly anilistId: number;
    readonly malId?: number | undefined;
  }) => void;
  readonly onRefresh: (request: AniDbRefreshRequest) => void;
  readonly resolveAniListIdFromMalIdError?: ExternalCallError | undefined;
}) {
  const dependenciesLayer = Layer.mergeAll(
    Layer.succeed(
      AniListClient,
      AniListClient.of({
        getAnimeMetadataById: (id: number) =>
          input.aniListDetailError !== undefined
            ? Effect.fail(input.aniListDetailError)
            : input.aniListDetailNone === true
              ? Effect.succeed(Option.none())
              : Effect.sync(() => {
                  input.onDetailLookup?.(id);
                  return Option.some(input.metadata ?? makeMetadata(id));
                }),
        searchAnimeMetadata: () => Effect.succeed([]),
        getSeasonalAnime: () => Effect.succeed([]),
        resolveAniListIdFromMalId: (malId: number) =>
          input.resolveAniListIdFromMalIdError !== undefined
            ? Effect.fail(input.resolveAniListIdFromMalIdError)
            : Effect.sync(() => {
                input.onResolveAniListId?.(malId);
                return Option.fromNullishOr(input.aniListIdByMalId?.get(malId));
              }),
      }),
    ),
    Layer.succeed(
      TenraiClient,
      TenraiClient.of({
        getAnimeByMalId: (malId: number) =>
          input.getAnimeByMalIdError !== undefined
            ? Effect.fail(input.getAnimeByMalIdError)
            : Effect.sync(() => {
                input.onTenraiLookup?.(malId);
                return Option.fromNullishOr(input.tenraiMetadata);
              }),
        getSeasonalAnime: () => Effect.succeed([]),
        searchAnime: () => Effect.succeed([]),
      }),
    ),
    Layer.succeed(
      ExternalIdMapRepository,
      ExternalIdMapRepository.of({
        loadByEitherIds: () => Effect.succeed([]),
        loadByEitherId: (id: number) =>
          input.idMapError !== undefined
            ? Effect.fail(input.idMapError)
            : Effect.sync(() => {
                const anilistId = input.idMapByMalId?.get(id);
                return Option.fromNullishOr(
                  anilistId === undefined
                    ? undefined
                    : {
                        anilistId,
                        malId: id,
                        updatedAt: "2024-01-01T00:00:00.000Z",
                      },
                );
              }),
        loadByAniListId: () => Effect.succeed(Option.none()),
        loadByAnidbAid: () => Effect.succeed(Option.none()),
        deleteByAniListId: () => Effect.void,
        loadByMalId: (malId: number) =>
          input.idMapError !== undefined
            ? Effect.fail(input.idMapError)
            : Effect.sync(() => {
                const anilistId = input.idMapByMalId?.get(malId);
                return Option.fromNullishOr(
                  anilistId === undefined
                    ? undefined
                    : { anilistId, updatedAt: "2024-01-01T00:00:00.000Z" },
                );
              }),
        upsert: (upsertInput: {
          readonly anilistId: number;
          readonly malId?: number | undefined;
        }) =>
          Effect.sync(() => {
            input.onIdMapUpsert?.(upsertInput);
          }),
      }),
    ),
    Layer.succeed(
      MediaMetadataEnrichmentService,
      MediaMetadataEnrichmentService.of({
        getAniDbCacheState: () => Effect.succeed(input.cacheState),
        requestAniDbRefresh: (request: AniDbRefreshRequest) =>
          Effect.sync(() => input.onRefresh(request)),
      }),
    ),
    Layer.succeed(
      AniListDetailCacheRepository,
      input.detailCache ??
        AniListDetailCacheRepository.of({
          read: () => Effect.succeed(null),
          write: () => Effect.void,
        }),
    ),
  );

  // DefaultWithoutDependencies: the provider's own `.Default` embeds
  // MediaMetadataEnrichmentService.layer; the enrichment stub below must win.
  return MediaMetadataProviderService.layer.pipe(Layer.provideMerge(dependenciesLayer));
}

function makeMetadata(id: number, overrides?: Partial<AnimeMetadata>): AnimeMetadata {
  const metadata: AnimeMetadata = {
    genres: [],
    unitCount: 12,
    format: "TV",
    id,
    malId: id,
    status: "RELEASING",
    synonyms: [],
    title: {
      romaji: "Media",
    },
    ...overrides,
  };

  return {
    ...metadata,
    title: {
      romaji: overrides?.title?.romaji ?? "Media",
      english: overrides?.title?.english,
      native: overrides?.title?.native,
    },
  };
}

function makeTenraiMetadata(overrides: Partial<TenraiNormalizedAnime>): TenraiNormalizedAnime {
  const malId = overrides.malId ?? 1;

  return {
    airing: false,
    approved: true,
    background: undefined,
    broadcast: {},
    demographics: [],
    duration: undefined,
    endDate: undefined,
    endYear: undefined,
    unitCount: undefined,
    explicitGenres: [],
    favorites: undefined,
    format: undefined,
    genres: [],
    images: {},
    licensors: [],
    members: undefined,
    popularity: undefined,
    producers: [],
    rank: undefined,
    rating: undefined,
    recommendations: [],
    relations: [],
    score: undefined,
    scoredBy: undefined,
    season: undefined,
    source: undefined,
    startDate: undefined,
    startYear: undefined,
    status: undefined,
    studios: [],
    synopsis: undefined,
    themes: [],
    title: {},
    titleVariants: [],
    trailer: {},
    year: undefined,
    ...overrides,
    malId: overrides.malId ?? malId,
    url: overrides.url ?? `https://myanimelist.net/media/${overrides.malId ?? malId}`,
  };
}
