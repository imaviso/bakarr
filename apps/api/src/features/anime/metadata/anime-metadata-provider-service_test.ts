import { Effect, Layer, Option } from "effect";
import { brandAnimeId } from "@packages/shared/index.ts";

import { assert, it } from "@effect/vitest";
import { AniListClient } from "@/features/anime/metadata/anilist.ts";
import type { AnimeMetadata } from "@/features/anime/metadata/anilist-model.ts";
import { AnimeMetadataEnrichmentService } from "@/features/anime/metadata/anime-metadata-enrichment-service.ts";
import type { AniDbRefreshRequest } from "@/features/anime/metadata/anime-metadata-enrichment-service.ts";
import {
  AnimeMetadataProviderService,
  AnimeMetadataProviderServiceLive,
} from "@/features/anime/metadata/anime-metadata-provider-service.ts";
import { JikanClient } from "@/features/anime/metadata/jikan.ts";
import type { JikanNormalizedAnime } from "@/features/anime/metadata/jikan-model.ts";
import { ManamiClient, type ManamiLookupEntry } from "@/features/anime/metadata/manami.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";

it.effect("returns refresh pending when AniDB cache is missing", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    onRefresh: () => {
      refreshCount += 1;
    },
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
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

it.effect("backfills MAL id via Manami and merges metadata for AniDB refresh", () => {
  const refreshRequests: AniDbRefreshRequest[] = [];
  const jikanRequests: number[] = [];

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    jikanMetadata: makeJikanMetadata({
      endDate: "2024-06-30",
      episodeCount: 24,
      format: "TV",
      genres: ["Drama"],
      malId: 777,
      relations: [],
      score: 8.9,
      startDate: "2024-01-01",
      status: "Finished Airing",
      studios: ["Studio J"],
      synopsis: "Merged from Jikan",
      title: {
        english: "Merged English",
        native: "Merged Native",
        romaji: "Merged Romaji",
      },
      titleVariants: ["Merged Alias"],
    }),
    malIdFromAniListId: 777,
    manamiEntry: {
      englishTitle: "Manami Title",
      nativeTitle: "Manami Title",
      title: "Manami Title",
    },
    metadata: makeMetadata(1003, {
      episodeCount: undefined,
      malId: undefined,
      synonyms: ["Base Alias"],
    }),
    onJikanLookup: (malId) => {
      jikanRequests.push(malId);
    },
    onRefresh: (request) => {
      refreshRequests.push(request);
    },
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1003);

    assert.deepStrictEqual(jikanRequests, [777]);
    assert.deepStrictEqual(refreshRequests.length, 1);
    assert.deepStrictEqual(refreshRequests[0]?.episodeCount, 24);
    assert.deepStrictEqual(refreshRequests[0]?.title, {
      english: "Merged English",
      native: "Merged Native",
      romaji: "Anime",
    });
    assert.deepStrictEqual(refreshRequests[0]?.synonyms, ["Base Alias", "Merged Alias"]);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.metadata.description, "Merged from Jikan");
      assert.deepStrictEqual(result.metadata.genres, ["Drama"]);
      assert.deepStrictEqual(result.enrichment._tag, "Degraded");
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("returns enriched metadata when AniDB cache is fresh", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    cacheState: {
      _tag: "Fresh",
      episodes: [
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
    const service = yield* AnimeMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1002);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment, {
        _tag: "Enriched",
        episodes: 1,
        provider: "AniDB",
      });
      assert.deepStrictEqual(result.metadata.episodes?.[0], {
        aired: "2024-01-01T00:00:00.000Z",
        number: 1,
        title: "Pilot",
      });
    }

    assert.deepStrictEqual(refreshCount, 0);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("merges Jikan/Manami metadata before applying AniDB episode enrichment", () => {
  const providerLayer = makeProviderLayer({
    aniListIdByMalId: new Map([
      [202, 4004],
      [303, 5005],
    ]),
    cacheState: {
      _tag: "Fresh",
      episodes: [
        {
          aired: "2024-01-01T00:00:00.000Z",
          number: 1,
          title: "Pilot",
        },
      ],
      updatedAt: "2024-01-02T00:00:00.000Z",
    },
    jikanMetadata: {
      airing: false,
      approved: true,
      background: undefined,
      broadcast: {},
      demographics: [],
      duration: undefined,
      endDate: undefined,
      endYear: undefined,
      episodeCount: undefined,
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
      recommendations: [{ malId: 303, title: "Recommended from Jikan" }],
      relations: [{ malId: 202, relation: "Sequel", title: "Related from Jikan" }],
      score: undefined,
      scoredBy: undefined,
      season: undefined,
      source: undefined,
      startDate: undefined,
      startYear: undefined,
      status: undefined,
      studios: [],
      synopsis: "Jikan Synopsis",
      themes: [],
      title: {},
      titleVariants: [],
      trailer: {},
      url: "https://myanimelist.net/anime/1002",
      year: undefined,
    },
    manamiEntry: {
      englishTitle: "Anime",
      nativeTitle: "Anime",
      title: "Anime",
    },
    metadata: makeMetadata(1002, {
      genres: ["Action"],
      malId: 1002,
    }),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1002);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment, {
        _tag: "Enriched",
        episodes: 1,
        provider: "AniDB",
      });
      assert.deepStrictEqual(result.metadata.description, "Jikan Synopsis");
      assert.deepStrictEqual(result.metadata.genres, ["Action", "Drama"]);
      assert.deepStrictEqual(result.metadata.relatedAnime, [
        {
          id: brandAnimeId(4004),
          relation_type: "Sequel",
          title: {
            romaji: "Related from Jikan",
          },
        },
      ]);
      assert.deepStrictEqual(result.metadata.recommendedAnime, [
        {
          id: brandAnimeId(5005),
          title: {
            romaji: "Recommended from Jikan",
          },
        },
        {
          id: brandAnimeId(4004),
          relation_type: "Sequel",
          title: {
            romaji: "Related from Jikan",
          },
        },
      ]);
      assert.deepStrictEqual(result.metadata.episodes?.[0], {
        aired: "2024-01-01T00:00:00.000Z",
        number: 1,
        title: "Pilot",
      });
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("bubbles Manami getByAniListId failure", () => {
  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    getByAniListIdError: ExternalCallError.make({
      cause: new Error("manami getByAniListId failed"),
      message: "Manami lookup failed",
      operation: "ManamiClient.getByAniListId",
    }),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
    const error = yield* service.getAnimeMetadataById(1001).pipe(Effect.flip);

    assert.deepStrictEqual(error._tag, "ExternalCallError");
    if (error._tag === "ExternalCallError") {
      assert.deepStrictEqual(error.operation, "ManamiClient.getByAniListId");
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("bubbles Manami resolveMalIdFromAniListId failure when AniList MAL id missing", () => {
  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    metadata: makeMetadata(1004, {
      malId: undefined,
    }),
    resolveMalIdFromAniListIdError: ExternalCallError.make({
      cause: new Error("manami resolveMalIdFromAniListId failed"),
      message: "Manami MAL id resolve failed",
      operation: "ManamiClient.resolveMalIdFromAniListId",
    }),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
    const error = yield* service.getAnimeMetadataById(1004).pipe(Effect.flip);

    assert.deepStrictEqual(error._tag, "ExternalCallError");
    if (error._tag === "ExternalCallError") {
      assert.deepStrictEqual(error.operation, "ManamiClient.resolveMalIdFromAniListId");
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("bubbles Jikan getAnimeByMalId failure when MAL id available", () => {
  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    metadata: makeMetadata(1005, {
      malId: 505,
    }),
    getAnimeByMalIdError: ExternalCallError.make({
      cause: new Error("jikan getAnimeByMalId failed"),
      message: "Jikan lookup failed",
      operation: "JikanClient.getAnimeByMalId",
    }),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
    const error = yield* service.getAnimeMetadataById(1005).pipe(Effect.flip);

    assert.deepStrictEqual(error._tag, "ExternalCallError");
    if (error._tag === "ExternalCallError") {
      assert.deepStrictEqual(error.operation, "JikanClient.getAnimeByMalId");
    }
  }).pipe(Effect.provide(providerLayer));
});

it.effect("bubbles Manami resolveAniListIdFromMalId failure during relation mapping", () => {
  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    jikanMetadata: makeJikanMetadata({
      endDate: undefined,
      episodeCount: undefined,
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
      cause: new Error("manami resolveAniListIdFromMalId failed"),
      message: "Manami AniList id resolve failed",
      operation: "ManamiClient.resolveAniListIdFromMalId",
    }),
    onRefresh: () => {},
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
    const error = yield* service.getAnimeMetadataById(1006).pipe(Effect.flip);

    assert.deepStrictEqual(error._tag, "ExternalCallError");
    if (error._tag === "ExternalCallError") {
      assert.deepStrictEqual(error.operation, "ManamiClient.resolveAniListIdFromMalId");
    }
  }).pipe(Effect.provide(providerLayer));
});

function makeProviderLayer(input: {
  readonly cacheState:
    | { readonly _tag: "Missing" }
    | {
        readonly _tag: "Fresh";
        readonly episodes: ReadonlyArray<{
          readonly aired?: string | undefined;
          readonly number: number;
          readonly title?: string | undefined;
        }>;
        readonly updatedAt: string;
      };
  readonly aniListIdByMalId?: ReadonlyMap<number, number> | undefined;
  readonly jikanMetadata?: JikanNormalizedAnime | undefined;
  readonly getAnimeByMalIdError?: ExternalCallError | undefined;
  readonly getByAniListIdError?: ExternalCallError | undefined;
  readonly malIdFromAniListId?: number | undefined;
  readonly manamiEntry?: ManamiLookupEntry | undefined;
  readonly metadata?: AnimeMetadata | undefined;
  readonly onJikanLookup?: (malId: number) => void;
  readonly onRefresh: (request: AniDbRefreshRequest) => void;
  readonly resolveAniListIdFromMalIdError?: ExternalCallError | undefined;
  readonly resolveMalIdFromAniListIdError?: ExternalCallError | undefined;
}) {
  const dependenciesLayer = Layer.mergeAll(
    Layer.succeed(AniListClient, {
      getAnimeMetadataById: (id: number) =>
        Effect.succeed(Option.some(input.metadata ?? makeMetadata(id))),
      searchAnimeMetadata: () => Effect.succeed([]),
      getSeasonalAnime: () => Effect.succeed([]),
    }),
    Layer.succeed(JikanClient, {
      getAnimeByMalId: (malId: number) =>
        input.getAnimeByMalIdError !== undefined
          ? Effect.fail(input.getAnimeByMalIdError)
          : Effect.sync(() => {
              input.onJikanLookup?.(malId);
              return Option.fromNullable(input.jikanMetadata);
            }),
      getSeasonalAnime: () => Effect.succeed([]),
    }),
    Layer.succeed(ManamiClient, {
      getByAniListId: () =>
        input.getByAniListIdError !== undefined
          ? Effect.fail(input.getByAniListIdError)
          : Effect.succeed(Option.fromNullable(input.manamiEntry)),
      getByMalId: () => Effect.succeed(Option.none()),
      resolveAniListIdFromMalId: (malId: number) =>
        input.resolveAniListIdFromMalIdError !== undefined
          ? Effect.fail(input.resolveAniListIdFromMalIdError)
          : Effect.succeed(Option.fromNullable(input.aniListIdByMalId?.get(malId))),
      resolveMalIdFromAniListId: () =>
        input.resolveMalIdFromAniListIdError !== undefined
          ? Effect.fail(input.resolveMalIdFromAniListIdError)
          : Effect.succeed(Option.fromNullable(input.malIdFromAniListId)),
      searchAnime: () => Effect.succeed([]),
    }),
    Layer.succeed(AnimeMetadataEnrichmentService, {
      getAniDbCacheState: () => Effect.succeed(input.cacheState),
      requestAniDbRefresh: (request: AniDbRefreshRequest) =>
        Effect.sync(() => input.onRefresh(request)),
    }),
  );

  return AnimeMetadataProviderServiceLive.pipe(Layer.provideMerge(dependenciesLayer));
}

function makeMetadata(id: number, overrides?: Partial<AnimeMetadata>): AnimeMetadata {
  const metadata: AnimeMetadata = {
    genres: [],
    episodeCount: 12,
    format: "TV",
    id,
    malId: id,
    status: "RELEASING",
    synonyms: [],
    title: {
      romaji: "Anime",
    },
    ...overrides,
  };

  return {
    ...metadata,
    title: {
      romaji: overrides?.title?.romaji ?? "Anime",
      english: overrides?.title?.english,
      native: overrides?.title?.native,
    },
  };
}

function makeJikanMetadata(overrides: Partial<JikanNormalizedAnime>): JikanNormalizedAnime {
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
    episodeCount: undefined,
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
    url: overrides.url ?? `https://myanimelist.net/anime/${overrides.malId ?? malId}`,
  };
}
