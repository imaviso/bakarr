import { assert, describe, it } from "@effect/vitest";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { brandMediaId, type MediaSearchResult } from "@packages/shared/index.ts";
import {
  MediaSeasonalProviderService,
  MediaSeasonalProviderServiceLive,
} from "@/features/media/query/media-seasonal-provider-service.ts";
import { TenraiClient } from "@/features/media/metadata/tenrai.ts";
import type { TenraiNormalizedSeasonalEntry } from "@/features/media/metadata/tenrai-model.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { Effect, Layer, Option } from "effect";

function makeAniListSearchResult(
  id: number,
  overrides?: Partial<MediaSearchResult>,
): MediaSearchResult {
  return {
    format: "TV",
    id: brandMediaId(id),
    season: overrides?.season,
    season_year: overrides?.season_year,
    start_year: overrides?.start_year,
    status: "RELEASING",
    title: {
      english: overrides?.title?.english,
      native: overrides?.title?.native,
      romaji: overrides?.title?.romaji ?? `Media ${id}`,
    },
    ...overrides,
  };
}

function makeTenraiSeasonalEntry(
  malId: number,
  overrides?: Partial<TenraiNormalizedSeasonalEntry>,
): TenraiNormalizedSeasonalEntry {
  return {
    coverImage: undefined,
    unitCount: undefined,
    format: "TV",
    genres: undefined,
    malId,
    season: "spring",
    seasonYear: 2025,
    startYear: 2025,
    status: "Currently Airing",
    title: {
      english: overrides?.title?.english ?? `Title ${malId}`,
      native: overrides?.title?.native,
      romaji: overrides?.title?.romaji ?? `Romaji ${malId}`,
    },
    ...overrides,
  };
}

describe("MediaSeasonalProviderService", () => {
  it.effect("returns anilist results on success", () => {
    const anilistResults: Array<MediaSearchResult> = [
      makeAniListSearchResult(1, {
        season: "spring",
        season_year: 2025,
        start_year: 2025,
        title: { romaji: "Spring Media 1" },
      }),
      makeAniListSearchResult(2, {
        season: "spring",
        season_year: 2025,
        start_year: 2025,
        title: { romaji: "Spring Media 2" },
      }),
    ];

    const providerLayer = MediaSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.succeed(anilistResults),
              resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.succeed([]),
              searchAnime: () => Effect.succeed([]),
            }),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* MediaSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "spring",
        year: 2025,
      });

      assert.deepStrictEqual(result.provider, "anilist");
      assert.deepStrictEqual(result.degraded, false);
      assert.deepStrictEqual(result.hasMore, false);
      assert.deepStrictEqual(result.season, "spring");
      assert.deepStrictEqual(result.year, 2025);
      assert.deepStrictEqual(result.results.length, 2);
      assert.deepStrictEqual(result.results[0]?.id, 1);
      assert.deepStrictEqual(result.results[1]?.id, 2);
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("returns empty anilist results without degrading", () => {
    const providerLayer = MediaSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.succeed([]),
              resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.die(new Error("unexpected tenrai lookup")),
              getSeasonalAnime: () => Effect.die(new Error("unexpected tenrai seasonal lookup")),
              searchAnime: () => Effect.die(new Error("unexpected tenrai search lookup")),
            }),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* MediaSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "summer",
        year: 2025,
      });

      assert.deepStrictEqual(result.provider, "anilist");
      assert.deepStrictEqual(result.degraded, false);
      assert.deepStrictEqual(result.hasMore, false);
      assert.deepStrictEqual(result.results.length, 0);
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("falls back to tenrai with MAL-canonical ids and no mapping filter", () => {
    const tenraiEntries: Array<TenraiNormalizedSeasonalEntry> = [
      makeTenraiSeasonalEntry(101, {
        coverImage: "https://cdn.example/media/101.jpg",
        format: "TV",
        genres: ["Action", "Drama"],
        season: "spring",
        seasonYear: 2025,
        startYear: 2025,
        title: { romaji: "Tenrai Spring 1", english: "Tenrai Spring 1" },
      }),
      makeTenraiSeasonalEntry(102, {
        coverImage: "https://cdn.example/media/102.jpg",
        unitCount: 12,
        format: "TV",
        season: "spring",
        seasonYear: 2025,
        startYear: 2025,
        title: { romaji: "Tenrai Spring 2" },
      }),
    ];

    const providerLayer = MediaSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () =>
                Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("AniList seasonal failed"),
                    message: "AniList seasonal failed",
                    operation: "anilist.seasonal",
                  }),
                ),
              resolveAniListIdFromMalId: () =>
                Effect.die(new Error("unexpected anilist id resolution")),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.succeed(tenraiEntries),
              searchAnime: () => Effect.succeed([]),
            }),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* MediaSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "spring",
        year: 2025,
      });

      assert.deepStrictEqual(result.provider, "tenrai_fallback");
      assert.deepStrictEqual(result.degraded, true);
      assert.deepStrictEqual(result.hasMore, false);
      assert.deepStrictEqual(result.season, "spring");
      assert.deepStrictEqual(result.year, 2025);
      assert.deepStrictEqual(result.results.length, 2);
      assert.deepStrictEqual(result.results[0]?.id, 101);
      assert.deepStrictEqual(result.results[0]?.cover_image, "https://cdn.example/media/101.jpg");
      assert.deepStrictEqual(result.results[0]?.genres, ["Action", "Drama"]);
      assert.deepStrictEqual(result.results[1]?.id, 102);
      assert.deepStrictEqual(result.results[1]?.unit_count, 12);
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("fills missing tenrai seasonal fields from requested season window", () => {
    const providerLayer = MediaSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () =>
                Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("AniList seasonal failed"),
                    message: "AniList seasonal failed",
                    operation: "anilist.seasonal",
                  }),
                ),
              resolveAniListIdFromMalId: () => Effect.succeed(Option.some(4404)),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.succeed(Option.none()),
              searchAnime: () => Effect.succeed([]),
              getSeasonalAnime: () =>
                Effect.succeed([
                  makeTenraiSeasonalEntry(404, {
                    season: undefined,
                    seasonYear: undefined,
                    startYear: undefined,
                    title: { romaji: "Fallback Fill" },
                  }),
                ]),
            }),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* MediaSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "fall",
        year: 2027,
      });

      assert.deepStrictEqual(result.provider, "tenrai_fallback");
      assert.deepStrictEqual(result.hasMore, false);
      assert.deepStrictEqual(result.results[0]?.season, "fall");
      assert.deepStrictEqual(result.results[0]?.season_year, 2027);
      assert.deepStrictEqual(result.results[0]?.start_year, 2027);
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("serves tenrai entries without anilist mapping", () => {
    const tenraiEntries: Array<TenraiNormalizedSeasonalEntry> = [
      makeTenraiSeasonalEntry(101, {
        title: { romaji: "Mapped" },
      }),
      makeTenraiSeasonalEntry(102, {
        title: { romaji: "Unmapped" },
      }),
      makeTenraiSeasonalEntry(103, {
        title: { romaji: "Also Mapped" },
      }),
    ];

    const providerLayer = MediaSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () =>
                Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("AniList seasonal failed"),
                    message: "AniList seasonal failed",
                    operation: "anilist.seasonal",
                  }),
                ),
              resolveAniListIdFromMalId: () =>
                Effect.die(new Error("unexpected anilist id resolution")),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.succeed(tenraiEntries),
              searchAnime: () => Effect.succeed([]),
            }),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* MediaSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "fall",
        year: 2024,
      });

      assert.deepStrictEqual(result.provider, "tenrai_fallback");
      assert.deepStrictEqual(result.degraded, true);
      assert.deepStrictEqual(result.hasMore, false);
      assert.deepStrictEqual(result.results.length, 3);
      assert.deepStrictEqual(result.results[0]?.id, 101);
      assert.deepStrictEqual(result.results[0]?.title.romaji, "Mapped");
      assert.deepStrictEqual(result.results[1]?.id, 102);
      assert.deepStrictEqual(result.results[1]?.title.romaji, "Unmapped");
      assert.deepStrictEqual(result.results[2]?.id, 103);
      assert.deepStrictEqual(result.results[2]?.title.romaji, "Also Mapped");
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("bubbles tenrai failure when anilist also fails", () => {
    const providerLayer = MediaSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () =>
                Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("AniList seasonal failed"),
                    message: "AniList seasonal failed",
                    operation: "anilist.seasonal",
                  }),
                ),
              resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.succeed(Option.none()),
              searchAnime: () => Effect.succeed([]),
              getSeasonalAnime: () =>
                Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("Tenrai seasonal failed"),
                    message: "Tenrai seasonal failed",
                    operation: "tenrai.seasonal",
                  }),
                ),
            }),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* MediaSeasonalProviderService;
      const error = yield* service
        .getSeasonalAnime({ limit: 10, page: 1, season: "spring", year: 2025 })
        .pipe(Effect.flip);

      assert.deepStrictEqual(error._tag, "ExternalCallError");
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("fails fast for AniList normalization failures", () => {
    const providerLayer = MediaSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () =>
                Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("AniList seasonal normalize failed"),
                    message: "AniList seasonal normalize failed",
                    operation: "anilist.seasonal.normalize",
                  }),
                ),
              resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.die(new Error("unexpected tenrai fallback")),
              searchAnime: () => Effect.die(new Error("unexpected tenrai search lookup")),
            }),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* MediaSeasonalProviderService;
      const error = yield* service
        .getSeasonalAnime({ limit: 10, page: 1, season: "spring", year: 2025 })
        .pipe(Effect.flip);

      assert.deepStrictEqual(error._tag, "ExternalCallError");
      if (error._tag === "ExternalCallError") {
        assert.deepStrictEqual(error.operation, "anilist.seasonal.normalize");
      }
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("serves tenrai entries when id mapping fails during fallback", () => {
    const providerLayer = MediaSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () =>
                Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("AniList seasonal failed"),
                    message: "AniList seasonal failed",
                    operation: "anilist.seasonal",
                  }),
                ),
              resolveAniListIdFromMalId: () =>
                Effect.die(new Error("unexpected anilist id resolution")),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.succeed(Option.none()),
              searchAnime: () => Effect.succeed([]),
              getSeasonalAnime: () =>
                Effect.succeed([
                  makeTenraiSeasonalEntry(777, {
                    title: { romaji: "Needs Mapping" },
                  }),
                ]),
            }),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* MediaSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "spring",
        year: 2025,
      });

      assert.deepStrictEqual(result.provider, "tenrai_fallback");
      assert.deepStrictEqual(result.degraded, true);
      assert.deepStrictEqual(result.results.length, 1);
      assert.deepStrictEqual(result.results[0]?.id, 777);
      assert.deepStrictEqual(result.results[0]?.title.romaji, "Needs Mapping");
    }).pipe(Effect.provide(providerLayer));
  });
});
