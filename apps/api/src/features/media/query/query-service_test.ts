import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, TestClock } from "effect";

import {
  brandMediaId,
  resolveSeasonFromDate,
  resolveSeasonYearFromDate,
  type MediaSearchResult,
} from "@packages/shared/index.ts";
import * as schema from "@/db/schema.ts";
import { MediaQueryService } from "@/features/media/query/query-service.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { MediaSeasonalProviderService } from "@/features/media/query/media-seasonal-provider-service.ts";
import { AppDrizzleDatabase } from "@/db/database.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import {
  makeMediaRepository,
  makeSeasonalMediaCacheRepository,
} from "@/test/repository-factories.ts";
import { SeasonalMediaCacheRepository } from "@/features/media/query/seasonal-media-cache-repository.ts";

function makeSeasonalResult(input: {
  id: number;
  title: string;
  alreadyInLibrary?: boolean;
}): MediaSearchResult {
  return {
    already_in_library: input.alreadyInLibrary ?? false,
    format: "TV",
    id: brandMediaId(input.id),
    season: "spring",
    season_year: 2025,
    start_year: 2025,
    status: "RELEASING",
    title: { romaji: input.title },
  };
}

describe("MediaQueryService.listSeasonalMedia", () => {
  it.scoped("uses db cache within ttl and skips provider call", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          let providerCalls = 0;

          const providerLayer = Layer.succeed(
            MediaSeasonalProviderService,
            MediaSeasonalProviderService.make({
              getSeasonalAnime: () => {
                providerCalls += 1;
                return Effect.succeed({
                  degraded: false,
                  hasMore: false,
                  provider: "anilist",
                  results: [makeSeasonalResult({ id: 42, title: "Cached Spring" })],
                  season: "spring",
                  year: 2025,
                });
              },
            }),
          );

          const baseLayer = Layer.mergeAll(
            providerLayer,
            Layer.succeed(
              AniListClient,
              AniListClient.make({
                getAnimeMetadataById: () => Effect.succeed(Option.none()),
                getSeasonalAnime: () => Effect.succeed([]),
                searchAnimeMetadata: () => Effect.succeed([]),
              }),
            ),
            Layer.succeed(
              ManamiClient,
              ManamiClient.make({
                getByAniListId: () => Effect.succeed(Option.none()),
                getByMalId: () => Effect.succeed(Option.none()),
                resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                searchMedia: () => Effect.succeed([]),
              }),
            ),
            Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
            Layer.succeed(MediaRepository, makeMediaRepository(db)),
            Layer.succeed(SeasonalMediaCacheRepository, makeSeasonalMediaCacheRepository(db)),
          );

          const queryServiceLayer = MediaQueryService.DefaultWithoutDependencies.pipe(
            Layer.provide(baseLayer),
          );

          const listSeasonalMedia = (input: {
            season: "spring";
            year: number;
            page: number;
            limit: number;
          }) =>
            Effect.gen(function* () {
              yield* TestClock.setTime(new Date("2025-04-01T10:00:00.000Z").getTime());
              const service = yield* MediaQueryService;
              return yield* service.listSeasonalMedia(input);
            }).pipe(Effect.provide(queryServiceLayer));

          const first = yield* listSeasonalMedia({
            limit: 12,
            page: 1,
            season: "spring",
            year: 2025,
          });

          assert.deepStrictEqual(first.results.length, 1);
          assert.deepStrictEqual(providerCalls, 1);

          const second = yield* listSeasonalMedia({
            limit: 12,
            page: 1,
            season: "spring",
            year: 2025,
          });

          assert.deepStrictEqual(second.results.length, 1);
          assert.deepStrictEqual(providerCalls, 1);
        }),
      schema,
    }),
  );

  it.scoped("re-fetches when ttl expires", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          yield* TestClock.setTime(new Date("2025-04-01T10:00:00.000Z").getTime());
          let providerCalls = 0;

          const providerLayer = Layer.succeed(
            MediaSeasonalProviderService,
            MediaSeasonalProviderService.make({
              getSeasonalAnime: () => {
                providerCalls += 1;
                return Effect.succeed({
                  degraded: false,
                  hasMore: false,
                  provider: "anilist",
                  results: [makeSeasonalResult({ id: 7, title: `Fetch ${providerCalls}` })],
                  season: "spring",
                  year: 2025,
                });
              },
            }),
          );

          const layer = MediaQueryService.DefaultWithoutDependencies.pipe(
            Layer.provide(
              Layer.mergeAll(
                providerLayer,
                Layer.succeed(
                  AniListClient,
                  AniListClient.make({
                    getAnimeMetadataById: () => Effect.succeed(Option.none()),
                    getSeasonalAnime: () => Effect.succeed([]),
                    searchAnimeMetadata: () => Effect.succeed([]),
                  }),
                ),
                Layer.succeed(
                  ManamiClient,
                  ManamiClient.make({
                    getByAniListId: () => Effect.succeed(Option.none()),
                    getByMalId: () => Effect.succeed(Option.none()),
                    resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                    resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                    searchMedia: () => Effect.succeed([]),
                  }),
                ),
                Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
                Layer.succeed(MediaRepository, makeMediaRepository(db)),
                Layer.succeed(SeasonalMediaCacheRepository, makeSeasonalMediaCacheRepository(db)),
              ),
            ),
          );

          const service = yield* MediaQueryService.pipe(Effect.provide(layer));

          yield* service.listSeasonalMedia({ season: "spring", year: 2025, page: 1, limit: 12 });
          assert.deepStrictEqual(providerCalls, 1);

          yield* TestClock.adjust("6 minutes");
          const refreshed = yield* service.listSeasonalMedia({
            season: "spring",
            year: 2025,
            page: 1,
            limit: 12,
          });

          assert.deepStrictEqual(providerCalls, 2);
          assert.deepStrictEqual(refreshed.results[0]?.title.romaji, "Fetch 2");
        }),
      schema,
    }),
  );

  it.scoped("returns stale cache as degraded when provider fails after ttl", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          yield* TestClock.setTime(new Date("2025-04-01T10:00:00.000Z").getTime());
          let providerCalls = 0;

          const providerLayer = Layer.succeed(
            MediaSeasonalProviderService,
            MediaSeasonalProviderService.make({
              getSeasonalAnime: () => {
                providerCalls += 1;

                if (providerCalls === 1) {
                  return Effect.succeed({
                    degraded: false,
                    hasMore: false,
                    provider: "anilist",
                    results: [makeSeasonalResult({ id: 9, title: "Stale Spring" })],
                    season: "spring",
                    year: 2025,
                  });
                }

                return Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("seasonal outage"),
                    message: "Seasonal provider failed",
                    operation: "anilist.seasonal",
                  }),
                );
              },
            }),
          );

          const layer = MediaQueryService.DefaultWithoutDependencies.pipe(
            Layer.provide(
              Layer.mergeAll(
                providerLayer,
                Layer.succeed(
                  AniListClient,
                  AniListClient.make({
                    getAnimeMetadataById: () => Effect.succeed(Option.none()),
                    getSeasonalAnime: () => Effect.succeed([]),
                    searchAnimeMetadata: () => Effect.succeed([]),
                  }),
                ),
                Layer.succeed(
                  ManamiClient,
                  ManamiClient.make({
                    getByAniListId: () => Effect.succeed(Option.none()),
                    getByMalId: () => Effect.succeed(Option.none()),
                    resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                    resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                    searchMedia: () => Effect.succeed([]),
                  }),
                ),
                Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
                Layer.succeed(MediaRepository, makeMediaRepository(db)),
                Layer.succeed(SeasonalMediaCacheRepository, makeSeasonalMediaCacheRepository(db)),
              ),
            ),
          );

          const service = yield* MediaQueryService.pipe(Effect.provide(layer));

          yield* service.listSeasonalMedia({ season: "spring", year: 2025, page: 1, limit: 12 });
          yield* TestClock.adjust("6 minutes");

          const stale = yield* service.listSeasonalMedia({
            season: "spring",
            year: 2025,
            page: 1,
            limit: 12,
          });

          assert.deepStrictEqual(providerCalls, 2);
          assert.deepStrictEqual(stale.degraded, true);
          assert.deepStrictEqual(stale.provider, "anilist");
          assert.deepStrictEqual(stale.results[0]?.title.romaji, "Stale Spring");
        }),
      schema,
    }),
  );

  it.scoped("resolves defaults from now + marks already_in_library", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise(() =>
            db.insert(schema.media).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              unitCount: 12,
              format: "TV",
              genres: "[]",
              id: 1,
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/library/Seasonal",
              status: "RELEASING",
              studios: "[]",
              titleRomaji: "Winter Show",
            }),
          );

          yield* TestClock.setTime(new Date("2025-06-15T12:00:00Z").getTime());

          const providerService = MediaSeasonalProviderService.make({
            getSeasonalAnime: (input: {
              season: "spring" | "summer" | "fall" | "winter";
              year: number;
              limit: number;
              page: number;
            }) =>
              Effect.succeed({
                degraded: false,
                hasMore: true,
                provider: "anilist",
                results: [
                  {
                    already_in_library: false,
                    format: "TV",
                    id: brandMediaId(1),
                    season: input.season,
                    season_year: input.year,
                    start_year: input.year,
                    status: "RELEASING",
                    title: { romaji: "Winter Show" },
                  },
                  {
                    already_in_library: false,
                    format: "TV",
                    id: brandMediaId(2),
                    season: input.season,
                    season_year: input.year,
                    start_year: input.year,
                    status: "RELEASING",
                    title: { romaji: "New Summer Show" },
                  },
                ],
                season: input.season,
                year: input.year,
              }),
          });

          const layer = MediaQueryService.DefaultWithoutDependencies.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.succeed(MediaSeasonalProviderService, providerService),
                Layer.succeed(
                  AniListClient,
                  AniListClient.make({
                    getAnimeMetadataById: () => Effect.succeed(Option.none()),
                    getSeasonalAnime: () => Effect.succeed([]),
                    searchAnimeMetadata: () => Effect.succeed([]),
                  }),
                ),
                Layer.succeed(
                  ManamiClient,
                  ManamiClient.make({
                    getByAniListId: () => Effect.succeed(Option.none()),
                    getByMalId: () => Effect.succeed(Option.none()),
                    resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                    resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                    searchMedia: () => Effect.succeed([]),
                  }),
                ),
                Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
                Layer.succeed(MediaRepository, makeMediaRepository(db)),
                Layer.succeed(SeasonalMediaCacheRepository, makeSeasonalMediaCacheRepository(db)),
              ),
            ),
          );

          const service = yield* MediaQueryService.pipe(Effect.provide(layer));
          const result = yield* service.listSeasonalMedia();

          assert.deepStrictEqual(result.season, "summer");
          assert.deepStrictEqual(result.year, 2025);
          assert.deepStrictEqual(result.provider, "anilist");
          assert.deepStrictEqual(result.degraded, false);
          assert.deepStrictEqual(result.results.length, 2);
          assert.deepStrictEqual(result.results[0]?.already_in_library, true);
          assert.deepStrictEqual(result.results[1]?.already_in_library, false);
        }),
      schema,
    }),
  );

  it.scoped("respects explicit season/year/limit", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const providerService = MediaSeasonalProviderService.make({
            getSeasonalAnime: (input) =>
              Effect.succeed({
                degraded: true,
                hasMore: false,
                provider: "jikan_fallback",
                results: [
                  {
                    already_in_library: false,
                    format: "TV",
                    id: brandMediaId(10),
                    season: input.season,
                    season_year: input.year,
                    start_year: input.year,
                    status: "FINISHED",
                    title: { romaji: "Fall Classic" },
                  },
                ],
                season: input.season,
                year: input.year,
              }),
          });

          const layer = MediaQueryService.DefaultWithoutDependencies.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.succeed(MediaSeasonalProviderService, providerService),
                Layer.succeed(
                  AniListClient,
                  AniListClient.make({
                    getAnimeMetadataById: () => Effect.succeed(Option.none()),
                    getSeasonalAnime: () => Effect.succeed([]),
                    searchAnimeMetadata: () => Effect.succeed([]),
                  }),
                ),
                Layer.succeed(
                  ManamiClient,
                  ManamiClient.make({
                    getByAniListId: () => Effect.succeed(Option.none()),
                    getByMalId: () => Effect.succeed(Option.none()),
                    resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                    resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                    searchMedia: () => Effect.succeed([]),
                  }),
                ),
                Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
                Layer.succeed(MediaRepository, makeMediaRepository(db)),
                Layer.succeed(SeasonalMediaCacheRepository, makeSeasonalMediaCacheRepository(db)),
              ),
            ),
          );

          const service = yield* MediaQueryService.pipe(Effect.provide(layer));
          const result = yield* service.listSeasonalMedia({
            season: "fall",
            year: 2024,
            page: 2,
            limit: 5,
          });

          assert.deepStrictEqual(result.season, "fall");
          assert.deepStrictEqual(result.year, 2024);
          assert.deepStrictEqual(result.provider, "jikan_fallback");
          assert.deepStrictEqual(result.degraded, true);
          assert.deepStrictEqual(result.page, 2);
          assert.deepStrictEqual(result.limit, 5);
          assert.deepStrictEqual(result.has_more, false);
          assert.deepStrictEqual(result.results.length, 1);
          assert.deepStrictEqual(result.results[0]?.id, 10);
        }),
      schema,
    }),
  );
});

describe("resolveSeasonFromDate / resolveSeasonYearFromDate", () => {
  it("resolves winter for January", () => {
    assert.deepStrictEqual(resolveSeasonFromDate(new Date("2025-01-15")), "winter");
  });

  it("resolves spring for April", () => {
    assert.deepStrictEqual(resolveSeasonFromDate(new Date("2025-04-15")), "spring");
  });

  it("resolves summer for July", () => {
    assert.deepStrictEqual(resolveSeasonFromDate(new Date("2025-07-15")), "summer");
  });

  it("resolves fall for October", () => {
    assert.deepStrictEqual(resolveSeasonFromDate(new Date("2025-10-15")), "fall");
  });

  it("resolves winter for December and bumps year", () => {
    assert.deepStrictEqual(resolveSeasonFromDate(new Date("2025-12-15")), "winter");
    assert.deepStrictEqual(resolveSeasonYearFromDate(new Date("2025-12-15")), 2026);
  });

  it("resolves year without bump for non-December months", () => {
    assert.deepStrictEqual(resolveSeasonYearFromDate(new Date("2025-06-15")), 2025);
  });
});

describe("MediaQueryService.searchMedia", () => {
  it.scoped("falls back to Manami local search when AniList search fails", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          yield* TestClock.setTime(new Date("2025-04-01T10:00:00.000Z").getTime());
          const layer = MediaQueryService.DefaultWithoutDependencies.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.succeed(
                  MediaSeasonalProviderService,
                  MediaSeasonalProviderService.make({
                    getSeasonalAnime: () =>
                      Effect.succeed({
                        degraded: false,
                        hasMore: false,
                        provider: "anilist",
                        results: [],
                        season: "spring",
                        year: 2025,
                      }),
                  }),
                ),
                Layer.succeed(
                  AniListClient,
                  AniListClient.make({
                    getAnimeMetadataById: () => Effect.succeed(Option.none()),
                    getSeasonalAnime: () => Effect.succeed([]),
                    searchAnimeMetadata: () =>
                      Effect.fail(
                        ExternalCallError.make({
                          cause: new Error("rate limited"),
                          message: "AniList search failed",
                          operation: "anilist.search.response",
                        }),
                      ),
                  }),
                ),
                Layer.succeed(
                  ManamiClient,
                  ManamiClient.make({
                    getByAniListId: () => Effect.succeed(Option.none()),
                    getByMalId: () => Effect.succeed(Option.none()),
                    resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                    resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                    searchMedia: () =>
                      Effect.succeed([
                        {
                          already_in_library: false,
                          id: brandMediaId(1001),
                          synonyms: ["Alpha Alias"],
                          title: { english: "Alpha", romaji: "Alpha" },
                        },
                      ]),
                  }),
                ),
                Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
                Layer.succeed(MediaRepository, makeMediaRepository(db)),
                Layer.succeed(SeasonalMediaCacheRepository, makeSeasonalMediaCacheRepository(db)),
              ),
            ),
          );

          const service = yield* MediaQueryService.pipe(Effect.provide(layer));
          const result = yield* service.searchMedia("Alpha Alias");

          assert.deepStrictEqual(result.degraded, true);
          assert.deepStrictEqual(
            result.results.map((item) => item.id),
            [1001],
          );
          assert.deepStrictEqual(result.results[0]?.match_confidence, 1);
        }),
      schema,
    }),
  );
});
