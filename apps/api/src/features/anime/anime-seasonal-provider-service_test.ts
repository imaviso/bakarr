import { Effect, Layer, Option } from "effect";

import { assert, describe, it } from "@effect/vitest";
import { AniListClient } from "@/features/anime/anilist.ts";
import { brandAnimeId, type AnimeSearchResult, type AnimeSeason } from "@packages/shared/index.ts";
import {
  AnimeSeasonalProviderService,
  AnimeSeasonalProviderServiceLive,
} from "@/features/anime/anime-seasonal-provider-service.ts";
import { JikanClient } from "@/features/anime/jikan.ts";
import type { JikanNormalizedSeasonalEntry } from "@/features/anime/jikan-model.ts";
import { ManamiClient } from "@/features/anime/manami.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";

function makeAniListSearchResult(
  id: number,
  overrides?: Partial<AnimeSearchResult>,
): AnimeSearchResult {
  return {
    format: "TV",
    id: brandAnimeId(id),
    season: overrides?.season,
    season_year: overrides?.season_year,
    start_year: overrides?.start_year,
    status: "RELEASING",
    title: {
      english: overrides?.title?.english,
      native: overrides?.title?.native,
      romaji: overrides?.title?.romaji ?? `Anime ${id}`,
    },
    ...overrides,
  };
}

function makeJikanSeasonalEntry(
  malId: number,
  overrides?: Partial<JikanNormalizedSeasonalEntry>,
): JikanNormalizedSeasonalEntry {
  return {
    coverImage: undefined,
    episodeCount: undefined,
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

describe("AnimeSeasonalProviderService", () => {
  it.effect("returns anilist results on success", () => {
    const anilistResults: Array<AnimeSearchResult> = [
      makeAniListSearchResult(1, {
        season: "spring" as AnimeSeason,
        season_year: 2025,
        start_year: 2025,
        title: { romaji: "Spring Anime 1" },
      }),
      makeAniListSearchResult(2, {
        season: "spring" as AnimeSeason,
        season_year: 2025,
        start_year: 2025,
        title: { romaji: "Spring Anime 2" },
      }),
    ];

    const providerLayer = AnimeSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(AniListClient, {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () => Effect.succeed(anilistResults),
            searchAnimeMetadata: () => Effect.succeed([]),
          }),
          Layer.succeed(JikanClient, {
            getAnimeByMalId: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () => Effect.succeed([]),
          }),
          Layer.succeed(ManamiClient, {
            getByAniListId: () => Effect.succeed(Option.none()),
            getByMalId: () => Effect.succeed(Option.none()),
            resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
            resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
            searchAnime: () => Effect.succeed([]),
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* AnimeSeasonalProviderService;
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
    const providerLayer = AnimeSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(AniListClient, {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () => Effect.succeed([]),
            searchAnimeMetadata: () => Effect.succeed([]),
          }),
          Layer.succeed(JikanClient, {
            getAnimeByMalId: () => Effect.dieMessage("unexpected jikan lookup"),
            getSeasonalAnime: () => Effect.dieMessage("unexpected jikan seasonal lookup"),
          }),
          Layer.succeed(ManamiClient, {
            getByAniListId: () => Effect.succeed(Option.none()),
            getByMalId: () => Effect.succeed(Option.none()),
            resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
            resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
            searchAnime: () => Effect.succeed([]),
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* AnimeSeasonalProviderService;
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

  it.effect("falls back to jikan and maps entries via manami", () => {
    const jikanEntries: Array<JikanNormalizedSeasonalEntry> = [
      makeJikanSeasonalEntry(101, {
        coverImage: "https://cdn.example/anime/101.jpg",
        format: "TV",
        genres: ["Action", "Drama"],
        season: "spring",
        seasonYear: 2025,
        startYear: 2025,
        title: { romaji: "Jikan Spring 1", english: "Jikan Spring 1" },
      }),
      makeJikanSeasonalEntry(102, {
        coverImage: "https://cdn.example/anime/102.jpg",
        episodeCount: 12,
        format: "TV",
        season: "spring",
        seasonYear: 2025,
        startYear: 2025,
        title: { romaji: "Jikan Spring 2" },
      }),
    ];

    const resolveCalls: Array<number> = [];

    const providerLayer = AnimeSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(AniListClient, {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.fail(
                ExternalCallError.make({
                  cause: new Error("AniList seasonal failed"),
                  message: "AniList seasonal failed",
                  operation: "anilist.seasonal",
                }),
              ),
            searchAnimeMetadata: () => Effect.succeed([]),
          }),
          Layer.succeed(JikanClient, {
            getAnimeByMalId: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () => Effect.succeed(jikanEntries),
          }),
          Layer.succeed(ManamiClient, {
            getByAniListId: () => Effect.succeed(Option.none()),
            getByMalId: () => Effect.succeed(Option.none()),
            resolveAniListIdFromMalId: (malId: number) =>
              Effect.sync(() => {
                resolveCalls.push(malId);

                if (malId === 101) {
                  return Option.some(2001);
                }

                if (malId === 102) {
                  return Option.some(2002);
                }

                return Option.none();
              }),
            resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
            searchAnime: () => Effect.succeed([]),
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* AnimeSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "spring",
        year: 2025,
      });

      assert.deepStrictEqual(result.provider, "jikan_fallback");
      assert.deepStrictEqual(result.degraded, true);
      assert.deepStrictEqual(result.hasMore, false);
      assert.deepStrictEqual(result.season, "spring");
      assert.deepStrictEqual(result.year, 2025);
      assert.deepStrictEqual(result.results.length, 2);
      assert.deepStrictEqual(result.results[0]?.id, 2001);
      assert.deepStrictEqual(result.results[0]?.cover_image, "https://cdn.example/anime/101.jpg");
      assert.deepStrictEqual(result.results[0]?.genres, ["Action", "Drama"]);
      assert.deepStrictEqual(result.results[1]?.id, 2002);
      assert.deepStrictEqual(result.results[1]?.episode_count, 12);
      assert.deepStrictEqual(resolveCalls, [101, 102]);
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("fills missing jikan seasonal fields from requested season window", () => {
    const providerLayer = AnimeSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(AniListClient, {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.fail(
                ExternalCallError.make({
                  cause: new Error("AniList seasonal failed"),
                  message: "AniList seasonal failed",
                  operation: "anilist.seasonal",
                }),
              ),
            searchAnimeMetadata: () => Effect.succeed([]),
          }),
          Layer.succeed(JikanClient, {
            getAnimeByMalId: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.succeed([
                makeJikanSeasonalEntry(404, {
                  season: undefined,
                  seasonYear: undefined,
                  startYear: undefined,
                  title: { romaji: "Fallback Fill" },
                }),
              ]),
          }),
          Layer.succeed(ManamiClient, {
            getByAniListId: () => Effect.succeed(Option.none()),
            getByMalId: () => Effect.succeed(Option.none()),
            resolveAniListIdFromMalId: () => Effect.succeed(Option.some(4404)),
            resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
            searchAnime: () => Effect.succeed([]),
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* AnimeSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "fall",
        year: 2027,
      });

      assert.deepStrictEqual(result.provider, "jikan_fallback");
      assert.deepStrictEqual(result.hasMore, false);
      assert.deepStrictEqual(result.results[0]?.season, "fall");
      assert.deepStrictEqual(result.results[0]?.season_year, 2027);
      assert.deepStrictEqual(result.results[0]?.start_year, 2027);
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("drops jikan entries without anilist mapping", () => {
    const jikanEntries: Array<JikanNormalizedSeasonalEntry> = [
      makeJikanSeasonalEntry(101, {
        title: { romaji: "Mapped" },
      }),
      makeJikanSeasonalEntry(102, {
        title: { romaji: "Unmapped" },
      }),
      makeJikanSeasonalEntry(103, {
        title: { romaji: "Also Mapped" },
      }),
    ];

    const providerLayer = AnimeSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(AniListClient, {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.fail(
                ExternalCallError.make({
                  cause: new Error("AniList seasonal failed"),
                  message: "AniList seasonal failed",
                  operation: "anilist.seasonal",
                }),
              ),
            searchAnimeMetadata: () => Effect.succeed([]),
          }),
          Layer.succeed(JikanClient, {
            getAnimeByMalId: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () => Effect.succeed(jikanEntries),
          }),
          Layer.succeed(ManamiClient, {
            getByAniListId: () => Effect.succeed(Option.none()),
            getByMalId: () => Effect.succeed(Option.none()),
            resolveAniListIdFromMalId: (malId: number) =>
              Effect.sync(() => {
                if (malId === 101) {
                  return Option.some(3001);
                }

                if (malId === 103) {
                  return Option.some(3003);
                }

                return Option.none();
              }),
            resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
            searchAnime: () => Effect.succeed([]),
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* AnimeSeasonalProviderService;
      const result = yield* service.getSeasonalAnime({
        limit: 10,
        page: 1,
        season: "fall",
        year: 2024,
      });

      assert.deepStrictEqual(result.provider, "jikan_fallback");
      assert.deepStrictEqual(result.degraded, true);
      assert.deepStrictEqual(result.hasMore, false);
      assert.deepStrictEqual(result.results.length, 2);
      assert.deepStrictEqual(result.results[0]?.id, 3001);
      assert.deepStrictEqual(result.results[0]?.title.romaji, "Mapped");
      assert.deepStrictEqual(result.results[1]?.id, 3003);
      assert.deepStrictEqual(result.results[1]?.title.romaji, "Also Mapped");
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("bubbles jikan failure when anilist also fails", () => {
    const providerLayer = AnimeSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(AniListClient, {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.fail(
                ExternalCallError.make({
                  cause: new Error("AniList seasonal failed"),
                  message: "AniList seasonal failed",
                  operation: "anilist.seasonal",
                }),
              ),
            searchAnimeMetadata: () => Effect.succeed([]),
          }),
          Layer.succeed(JikanClient, {
            getAnimeByMalId: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.fail(
                ExternalCallError.make({
                  cause: new Error("Jikan seasonal failed"),
                  message: "Jikan seasonal failed",
                  operation: "jikan.seasonal",
                }),
              ),
          }),
          Layer.succeed(ManamiClient, {
            getByAniListId: () => Effect.succeed(Option.none()),
            getByMalId: () => Effect.succeed(Option.none()),
            resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
            resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
            searchAnime: () => Effect.succeed([]),
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* AnimeSeasonalProviderService;
      const error = yield* service
        .getSeasonalAnime({ limit: 10, page: 1, season: "spring", year: 2025 })
        .pipe(Effect.flip);

      assert.deepStrictEqual(error._tag, "ExternalCallError");
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("fails fast for AniList normalization failures", () => {
    const providerLayer = AnimeSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(AniListClient, {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.fail(
                ExternalCallError.make({
                  cause: new Error("AniList seasonal normalize failed"),
                  message: "AniList seasonal normalize failed",
                  operation: "anilist.seasonal.normalize",
                }),
              ),
            searchAnimeMetadata: () => Effect.succeed([]),
          }),
          Layer.succeed(JikanClient, {
            getAnimeByMalId: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () => Effect.dieMessage("unexpected jikan fallback"),
          }),
          Layer.succeed(ManamiClient, {
            getByAniListId: () => Effect.succeed(Option.none()),
            getByMalId: () => Effect.succeed(Option.none()),
            resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
            resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
            searchAnime: () => Effect.succeed([]),
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* AnimeSeasonalProviderService;
      const error = yield* service
        .getSeasonalAnime({ limit: 10, page: 1, season: "spring", year: 2025 })
        .pipe(Effect.flip);

      assert.deepStrictEqual(error._tag, "ExternalCallError");
      if (error._tag === "ExternalCallError") {
        assert.deepStrictEqual(error.operation, "anilist.seasonal.normalize");
      }
    }).pipe(Effect.provide(providerLayer));
  });

  it.effect("bubbles manami resolve failure during jikan fallback", () => {
    const providerLayer = AnimeSeasonalProviderServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(AniListClient, {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.fail(
                ExternalCallError.make({
                  cause: new Error("AniList seasonal failed"),
                  message: "AniList seasonal failed",
                  operation: "anilist.seasonal",
                }),
              ),
            searchAnimeMetadata: () => Effect.succeed([]),
          }),
          Layer.succeed(JikanClient, {
            getAnimeByMalId: () => Effect.succeed(Option.none()),
            getSeasonalAnime: () =>
              Effect.succeed([
                makeJikanSeasonalEntry(777, {
                  title: { romaji: "Needs Mapping" },
                }),
              ]),
          }),
          Layer.succeed(ManamiClient, {
            getByAniListId: () => Effect.succeed(Option.none()),
            getByMalId: () => Effect.succeed(Option.none()),
            resolveAniListIdFromMalId: () =>
              Effect.fail(
                ExternalCallError.make({
                  cause: new Error("Manami mapping failed"),
                  message: "Manami mapping failed",
                  operation: "manami.resolveAniListIdFromMalId",
                }),
              ),
            resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
            searchAnime: () => Effect.succeed([]),
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* AnimeSeasonalProviderService;
      const error = yield* service
        .getSeasonalAnime({ limit: 10, page: 1, season: "spring", year: 2025 })
        .pipe(Effect.flip);

      assert.deepStrictEqual(error._tag, "ExternalCallError");
      if (error._tag === "ExternalCallError") {
        assert.deepStrictEqual(error.operation, "manami.resolveAniListIdFromMalId");
      }
    }).pipe(Effect.provide(providerLayer));
  });
});
