import { assert, describe, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Cause, Effect, Exit, Layer, Option, TestClock } from "effect";

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
import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import {
  makeMediaRepository,
  makeSeasonalMediaCacheRepository,
} from "@/test/repository-factories.ts";
import { SeasonalMediaCacheRepository } from "@/features/media/query/seasonal-media-cache-repository.ts";
import { deriveEpisodeTimelineMetadata } from "@/features/media/shared/derivations.ts";
import { MediaProbeMetadataFound } from "@/infra/media/probe.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { StoredDataError } from "@/features/errors.ts";
import { annotateMediaSearchResultsForQuery } from "@/features/media/query/media-search-annotation.ts";
import { MediaFileService } from "@/features/media/files/media-file-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { makeUnusedEventBusLayer } from "@/test/event-bus-stub.ts";
import { makeMediaUnitRepository, makeSystemLogRepository } from "@/test/repository-factories.ts";
import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";

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

function makeQueryServiceLayer(
  db: AppDatabase,
  stubs: {
    readonly aniList?: typeof AniListClient.Service;
    readonly manami?: typeof ManamiClient.Service;
  } = {},
) {
  const providerService = MediaSeasonalProviderService.make({
    getSeasonalAnime: () =>
      Effect.succeed({
        degraded: false,
        hasMore: false,
        provider: "anilist",
        results: [],
        season: "spring",
        year: 2025,
      }),
  });
  const aniList =
    stubs.aniList ??
    AniListClient.make({
      getAnimeMetadataById: () => Effect.succeed(Option.none()),
      getSeasonalAnime: () => Effect.succeed([]),
      searchAnimeMetadata: () => Effect.succeed([]),
    });
  const manami =
    stubs.manami ??
    ManamiClient.make({
      getByAniListId: () => Effect.succeed(Option.none()),
      getByMalId: () => Effect.succeed(Option.none()),
      resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
      resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
      searchMedia: () => Effect.succeed([]),
    });

  return MediaQueryService.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(MediaSeasonalProviderService, providerService),
        Layer.succeed(AniListClient, aniList),
        Layer.succeed(ManamiClient, manami),
        Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
        Layer.succeed(MediaRepository, makeMediaRepository(db)),
        Layer.succeed(SeasonalMediaCacheRepository, makeSeasonalMediaCacheRepository(db)),
      ),
    ),
  );
}

it("annotateMediaSearchResultsForQuery adds confidence and reasons", () => {
  const results = annotateMediaSearchResultsForQuery("Naruto", [
    {
      id: brandMediaId(1),
      title: { romaji: "Naruto" },
      format: "TV",
      status: "RELEASING",
    },
    {
      id: brandMediaId(2),
      synonyms: ["Naruto: Shippuuden"],
      title: { romaji: "Naruto Shippuden" },
      format: "TV",
      status: "FINISHED",
    },
  ] satisfies MediaSearchResult[]);

  assert.deepStrictEqual(results[0]?.match_confidence, 1);
  assert.deepStrictEqual(results[0]?.match_reason, 'Exact title match for "Naruto"');
  assert.deepStrictEqual(results[1]?.match_confidence, 0.8);
  assert.deepStrictEqual(results[1]?.match_reason, 'Strong title match for "Naruto"');
});

it("annotateMediaSearchResultsForQuery considers synonyms", () => {
  const results = annotateMediaSearchResultsForQuery("Boku no Hero Academia", [
    {
      id: brandMediaId(7),
      synonyms: ["My Hero Academia", "Boku no Hero Academia"],
      title: { english: "My Hero Academia", romaji: "Boku no Hero Academia" },
    },
  ] satisfies MediaSearchResult[]);

  assert.deepStrictEqual(results[0]?.match_confidence, 1);
  assert.deepStrictEqual(results[0]?.match_reason, 'Exact title match for "Boku no Hero Academia"');
});

it("deriveEpisodeTimelineMetadata marks future and aired mediaUnits", () => {
  assert.deepStrictEqual(
    deriveEpisodeTimelineMetadata("2024-01-10T02:30:00.000Z", new Date("2024-01-09T12:00:00.000Z")),
    { airing_status: "future", is_future: true },
  );

  assert.deepStrictEqual(
    deriveEpisodeTimelineMetadata("2024-01-08T02:30:00.000Z", new Date("2024-01-09T12:00:00.000Z")),
    { airing_status: "aired", is_future: false },
  );

  assert.deepStrictEqual(deriveEpisodeTimelineMetadata(undefined), {
    airing_status: "unknown",
    is_future: undefined,
  });
});

it.scoped("MediaQueryService.listUnits returns stored unit probe metadata", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ root, fs }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const filePath = `${root}/MediaUnit 1.mkv`;
          yield* writeTextFile(fs, filePath, "test");

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              unitCount: 1,
              format: "TV",
              genres: "[]",
              id: 1,
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: root,
              status: "RELEASING",
              studios: "[]",
              titleRomaji: "Test Show",
            }),
          );
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values({
              aired: "2024-01-01T00:00:00.000Z",
              mediaId: 1,
              downloaded: true,
              durationSeconds: 1440,
              filePath,
              fileSize: 4,
              audioChannels: "2.0",
              audioCodec: "AAC",
              number: 1,
              resolution: "1080p",
              title: "Pilot",
              videoCodec: "HEVC",
            }),
          );

          yield* TestClock.setTime(new Date("2024-01-02T00:00:00.000Z").getTime());
          const service = yield* MediaQueryService.pipe(
            Effect.provide(makeQueryServiceLayer(appDb)),
          );

          const result = yield* service.listUnits(1);

          assert.deepStrictEqual(result[0]?.resolution, "1080p");
          assert.deepStrictEqual(result[0]?.video_codec, "HEVC");
          assert.deepStrictEqual(result[0]?.audio_codec, "AAC");
          assert.deepStrictEqual(result[0]?.audio_channels, "2.0");
          assert.deepStrictEqual(result[0]?.duration_seconds, 1440);
          assert.deepStrictEqual(result[0]?.file_size, 4);
        }),
      ),
    schema,
  }),
);

it.scoped("MediaFileService.listFiles caches probed metadata to episode rows", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ root, fs }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const filePath = `${root}/MediaUnit 1.mkv`;
          yield* writeTextFile(fs, filePath, "test");

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              unitCount: 1,
              format: "TV",
              genres: "[]",
              id: 101,
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: root,
              status: "RELEASING",
              studios: "[]",
              titleRomaji: "Probe Cache Show",
            }),
          );

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values({
              aired: "2024-01-01T00:00:00.000Z",
              mediaId: 101,
              downloaded: true,
              filePath,
              fileSize: 4,
              number: 1,
              title: "Pilot",
            }),
          );

          let probeCalls = 0;
          const mediaProbe = MediaProbe.make({
            probeVideoFile: (_path: string) => {
              probeCalls += 1;
              return Effect.succeed(
                new MediaProbeMetadataFound({
                  metadata: {
                    audio_channels: "2.0",
                    audio_codec: "AAC",
                    duration_seconds: 1440,
                    resolution: "1080p",
                    video_codec: "HEVC",
                  },
                }),
              );
            },
          });

          const layer = MediaFileService.DefaultWithoutDependencies.pipe(
            Layer.provide(
              Layer.mergeAll(
                makeUnusedEventBusLayer("not used in test"),
                Layer.succeed(FileSystem, FileSystem.make(fs)),
                Layer.succeed(MediaProbe, mediaProbe),
                Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(appDb)),
                Layer.succeed(MediaRepository, makeMediaRepository(appDb)),
                Layer.succeed(MediaUnitRepository, makeMediaUnitRepository(appDb)),
                Layer.succeed(SystemLogRepository, makeSystemLogRepository(appDb)),
                Layer.succeed(
                  OperationsTaskLauncherService,
                  OperationsTaskLauncherService.make({
                    launch: () => Effect.dieMessage("not used in test"),
                  }),
                ),
              ),
            ),
          );

          const listFiles = (mediaId: number) =>
            Effect.gen(function* () {
              const service = yield* MediaFileService;
              return yield* service.listFiles(mediaId);
            }).pipe(Effect.provide(layer));

          const first = yield* listFiles(101);

          const episodeRows = yield* Effect.tryPromise(() =>
            appDb.select().from(schema.mediaUnits).where(eq(schema.mediaUnits.mediaId, 101)),
          );
          const [row] = episodeRows;

          assert.deepStrictEqual(first[0]?.resolution, "1080p");
          assert.deepStrictEqual(first[0]?.video_codec, "HEVC");
          assert.deepStrictEqual(first[0]?.audio_codec, "AAC");
          assert.deepStrictEqual(first[0]?.audio_channels, "2.0");
          assert.deepStrictEqual(first[0]?.duration_seconds, 1440);
          assert.deepStrictEqual(row?.resolution, "1080p");
          assert.deepStrictEqual(row?.videoCodec, "HEVC");
          assert.deepStrictEqual(row?.audioCodec, "AAC");
          assert.deepStrictEqual(row?.audioChannels, "2.0");
          assert.deepStrictEqual(row?.durationSeconds, 1440);

          const second = yield* listFiles(101);

          assert.deepStrictEqual(second[0]?.resolution, "1080p");
          assert.deepStrictEqual(second[0]?.video_codec, "HEVC");
          assert.deepStrictEqual(second[0]?.audio_codec, "AAC");
          assert.deepStrictEqual(second[0]?.audio_channels, "2.0");
          assert.deepStrictEqual(second[0]?.duration_seconds, 1440);
          assert.deepStrictEqual(probeCalls, 1);
        }),
      ),
    schema,
  }),
);

it.scoped("MediaQueryService.getMediaByAnilistId returns related and recommended metadata", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const service = yield* MediaQueryService.pipe(
          Effect.provide(
            makeQueryServiceLayer(appDb, {
              aniList: makeAniListStub({
                bannerImage: "https://example.com/banner.png",
                coverImage: "https://example.com/cover.png",
                format: "TV",
                id: brandMediaId(55),
                recommendedMedia: [
                  {
                    id: brandMediaId(77),
                    title: { english: "Recommendation", romaji: "Recommendation" },
                  },
                ],
                relatedMedia: [
                  {
                    id: brandMediaId(56),
                    relation_type: "SEQUEL",
                    title: { english: "Sequel", romaji: "Sequel" },
                  },
                ],
                startDate: "2024-04-03",
                startYear: 2024,
                status: "RELEASING",
                synonyms: ["Stub Alias"],
                title: { english: "Stub Show", romaji: "Stub Show" },
              }),
            }),
          ),
        );

        const result = yield* service.getMediaByAnilistId(55);

        assert.deepStrictEqual(result.related_media?.[0]?.relation_type, "SEQUEL");
        assert.deepStrictEqual(result.recommended_media?.[0]?.title.english, "Recommendation");
        assert.deepStrictEqual(result.synonyms, ["Stub Alias"]);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.getMedia returns discovery metadata from database storage", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            unitCount: 1,
            format: "TV",
            genres: "[]",
            id: 80,
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            rootFolder: "/library/Stub",
            status: "RELEASING",
            studios: "[]",
            synonyms: '["Alias One", "Alias Two"]',
            relatedMedia:
              '[{"id":79,"relation_type":"PREQUEL","title":{"romaji":"Prequel Show"},"format":"TV","status":"FINISHED"}]',
            recommendedMedia:
              '[{"id":81,"title":{"english":"Recommended Show","romaji":"Recommended Show"},"format":"TV","status":"FINISHED"}]',
            titleRomaji: "Stub Show",
          }),
        );
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.mediaUnits).values({
            mediaId: 80,
            downloaded: false,
            number: 1,
          }),
        );

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));
        const result = yield* service.getMedia(80);

        assert.deepStrictEqual(result.related_media?.[0]?.relation_type, "PREQUEL");
        assert.deepStrictEqual(result.recommended_media?.[0]?.title.english, "Recommended Show");
        assert.deepStrictEqual(result.synonyms, ["Alias One", "Alias Two"]);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.getMedia uses stored discovery metadata from database", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            unitCount: 1,
            format: "TV",
            genres: "[]",
            id: 90,
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            rootFolder: "/library/StoredMetadata",
            status: "RELEASING",
            studios: "[]",
            synonyms: '["Alt Title", "Another Name"]',
            relatedMedia:
              '[{"id":91,"title":{"romaji":"Related Show"},"format":"TV","status":"FINISHED"}]',
            recommendedMedia:
              '[{"id":92,"title":{"romaji":"Recommended Show"},"format":"TV","status":"FINISHED"}]',
            titleRomaji: "Stored Show",
          }),
        );
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.mediaUnits).values({
            mediaId: 90,
            downloaded: false,
            number: 1,
          }),
        );

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));
        const result = yield* service.getMedia(90);

        assert.deepStrictEqual(result.id, 90);
        assert.deepStrictEqual(result.synonyms, ["Alt Title", "Another Name"]);
        assert.deepStrictEqual(result.related_media?.length, 1);
        assert.deepStrictEqual(result.related_media?.[0]?.id, 91);
        assert.deepStrictEqual(result.recommended_media?.length, 1);
        assert.deepStrictEqual(result.recommended_media?.[0]?.id, 92);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.searchMedia falls back to Manami when AniList search fails", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const result = yield* Effect.exit(
          Effect.gen(function* () {
            const service = yield* MediaQueryService.pipe(
              Effect.provide(
                makeQueryServiceLayer(appDb, {
                  aniList: AniListClient.make({
                    getAnimeMetadataById: () => Effect.succeed(Option.none()),
                    searchAnimeMetadata: () =>
                      Effect.fail(
                        new ExternalCallError({
                          cause: new Error("rate limited"),
                          message: "AniList search failed",
                          operation: "anilist.search.response",
                        }),
                      ),
                    getSeasonalAnime: () => Effect.succeed([]),
                  }),
                }),
              ),
            );
            return yield* service.searchMedia("bake");
          }),
        );

        assert.deepStrictEqual(Exit.isSuccess(result), true);
        if (Exit.isSuccess(result)) {
          assert.deepStrictEqual(result.value.degraded, true);
          assert.deepStrictEqual(result.value.results.length, 0);
        }
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.searchMedia reports non-degraded when AniList search succeeds", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const service = yield* MediaQueryService.pipe(
          Effect.provide(
            makeQueryServiceLayer(appDb, {
              aniList: AniListClient.make({
                getAnimeMetadataById: () => Effect.succeed(Option.none()),
                searchAnimeMetadata: () =>
                  Effect.succeed([
                    {
                      already_in_library: false,
                      id: brandMediaId(202),
                      title: { romaji: "Bakemonogatari" },
                    } satisfies MediaSearchResult,
                  ]),
                getSeasonalAnime: () => Effect.succeed([]),
              }),
            }),
          ),
        );

        const result = yield* service.searchMedia("bake");

        assert.deepStrictEqual(result.degraded, false);
        assert.deepStrictEqual(result.results.length, 1);
        assert.deepStrictEqual(result.results[0]?.id, 202);
      }),
    schema,
  }),
);

it.scoped(
  "MediaQueryService.searchMedia falls back to Manami when AniList returns no results",
  () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const service = yield* MediaQueryService.pipe(
            Effect.provide(
              makeQueryServiceLayer(appDb, {
                aniList: AniListClient.make({
                  getAnimeMetadataById: () => Effect.succeed(Option.none()),
                  searchAnimeMetadata: () => Effect.succeed([]),
                  getSeasonalAnime: () => Effect.succeed([]),
                }),
                manami: ManamiClient.make({
                  getByAniListId: () => Effect.succeed(Option.none()),
                  getByMalId: () => Effect.succeed(Option.none()),
                  resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                  resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                  searchMedia: () =>
                    Effect.succeed([
                      {
                        already_in_library: false,
                        id: brandMediaId(20),
                        title: { english: "Naruto", romaji: "NARUTO" },
                      } satisfies MediaSearchResult,
                    ]),
                }),
              }),
            ),
          );

          const result = yield* service.searchMedia("Naruto");

          assert.deepStrictEqual(result.degraded, true);
          assert.deepStrictEqual(result.results.length, 1);
          assert.deepStrictEqual(result.results[0]?.id, 20);
          assert.deepStrictEqual(result.results[0]?.match_confidence, 1);
        }),
      schema,
    }),
);

function makeAniListStub(metadata: AnimeMetadata) {
  return AniListClient.make({
    getAnimeMetadataById: () => Effect.succeed(Option.some(metadata)),
    searchAnimeMetadata: () => Effect.succeed([]),
    getSeasonalAnime: () => Effect.succeed([]),
  });
}

it.scoped("MediaQueryService.listMedia returns paginated results with defaults", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        for (let i = 1; i <= 5; i++) {
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              id: i,
              titleRomaji: `Show ${i}`,
              rootFolder: `/test/${i}`,
              format: "TV",
              status: "FINISHED",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: true,
            }),
          );
        }

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));
        const result = yield* service.listMedia();

        assert.deepStrictEqual(result.total, 5);
        assert.deepStrictEqual(result.offset, 0);
        assert.deepStrictEqual(result.limit, 100);
        assert.deepStrictEqual(result.items.length, 5);
        assert.deepStrictEqual(result.has_more, false);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.listMedia respects limit and offset", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        for (let i = 1; i <= 10; i++) {
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              id: i,
              titleRomaji: `Show ${i}`,
              rootFolder: `/test/${i}`,
              format: "TV",
              status: "FINISHED",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: true,
            }),
          );
        }

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));

        const page1 = yield* service.listMedia({ limit: 3, offset: 0 });
        const page1First = page1.items[0];
        assert(page1First);
        assert.deepStrictEqual(page1.items.length, 3);
        assert.deepStrictEqual(page1First.id, 1);
        assert.deepStrictEqual(page1.has_more, true);
        assert.deepStrictEqual(page1.total, 10);

        const page2 = yield* service.listMedia({ limit: 3, offset: 3 });
        const page2First = page2.items[0];
        assert(page2First);
        assert.deepStrictEqual(page2.items.length, 3);
        assert.deepStrictEqual(page2First.id, 4);
        assert.deepStrictEqual(page2.has_more, true);

        const page4 = yield* service.listMedia({ limit: 3, offset: 9 });
        const page4First = page4.items[0];
        assert(page4First);
        assert.deepStrictEqual(page4.items.length, 1);
        assert.deepStrictEqual(page4First.id, 10);
        assert.deepStrictEqual(page4.has_more, false);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.listMedia caps limit at 500", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 1,
            titleRomaji: "Show",
            rootFolder: "/test",
            format: "TV",
            status: "FINISHED",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
          }),
        );

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));
        const result = yield* service.listMedia({ limit: 1000 });
        assert.deepStrictEqual(result.limit, 500);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.listMedia floors limit at 1", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 1,
            titleRomaji: "Show",
            rootFolder: "/test",
            format: "TV",
            status: "FINISHED",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
          }),
        );

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));
        const result = yield* service.listMedia({ limit: 0 });
        assert.deepStrictEqual(result.limit, 1);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.listMedia floors negative offset at 0", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 1,
            titleRomaji: "Show",
            rootFolder: "/test",
            format: "TV",
            status: "FINISHED",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
          }),
        );

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));
        const result = yield* service.listMedia({ offset: -10 });
        assert.deepStrictEqual(result.offset, 0);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.listMedia aggregates episode download counts", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 1,
            titleRomaji: "Show",
            rootFolder: "/test",
            format: "TV",
            status: "FINISHED",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
            unitCount: 3,
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.mediaUnits).values([
            { mediaId: 1, number: 1, downloaded: true, filePath: "/ep1.mkv" },
            { mediaId: 1, number: 2, downloaded: true, filePath: "/ep2.mkv" },
            { mediaId: 1, number: 3, downloaded: false, filePath: null },
          ]),
        );

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));
        const result = yield* service.listMedia();
        const firstItem = result.items[0];
        assert(firstItem);
        assert.deepStrictEqual(result.items.length, 1);
        assert.deepStrictEqual(firstItem.progress.downloaded, 2);
      }),
    schema,
  }),
);

it.scoped("MediaQueryService.listMedia filters by monitored status", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values([
            {
              id: 1,
              titleRomaji: "Monitored Show",
              rootFolder: "/test/1",
              format: "TV",
              status: "FINISHED",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: true,
            },
            {
              id: 2,
              titleRomaji: "Unmonitored Show",
              rootFolder: "/test/2",
              format: "TV",
              status: "FINISHED",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: false,
            },
          ]),
        );

        const service = yield* MediaQueryService.pipe(Effect.provide(makeQueryServiceLayer(appDb)));

        const allResults = yield* service.listMedia();
        assert.deepStrictEqual(allResults.total, 2);
        assert.deepStrictEqual(allResults.items.length, 2);

        const monitoredOnly = yield* service.listMedia({ monitored: true });
        const monitoredFirst = monitoredOnly.items[0];
        assert(monitoredFirst);
        assert.deepStrictEqual(monitoredOnly.total, 1);
        assert.deepStrictEqual(monitoredFirst.id, 1);

        const unmonitoredOnly = yield* service.listMedia({ monitored: false });
        const unmonitoredFirst = unmonitoredOnly.items[0];
        assert(unmonitoredFirst);
        assert.deepStrictEqual(unmonitoredOnly.total, 1);
        assert.deepStrictEqual(unmonitoredFirst.id, 2);
      }),
    schema,
  }),
);

it.scoped(
  "MediaQueryService.listMedia includes progress and metadata fields needed by list UI",
  () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              id: 10,
              titleRomaji: "Detailed Show",
              rootFolder: "/test/10",
              format: "TV",
              status: "RELEASING",
              genres: '["Action"]',
              studios: '["Studio A"]',
              score: 87,
              profileName: "Default",
              releaseProfileIds: "[1,2]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: true,
              unitCount: 3,
            }),
          );

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values([
              { mediaId: 10, number: 1, downloaded: true, filePath: "/ep1.mkv" },
              { mediaId: 10, number: 2, downloaded: false, filePath: null },
              { mediaId: 10, number: 3, downloaded: false, filePath: null },
            ]),
          );

          const service = yield* MediaQueryService.pipe(
            Effect.provide(makeQueryServiceLayer(appDb)),
          );
          const result = yield* service.listMedia();
          assert.deepStrictEqual(result.items.length, 1);

          const media = result.items[0];
          assert(media);
          assert.deepStrictEqual(media.progress.downloaded, 1);
          assert.deepStrictEqual(media.progress.total, 3);
          assert.deepStrictEqual(media.progress.downloaded_percent, 33);
          assert.deepStrictEqual(media.progress.is_up_to_date, false);
          assert.deepStrictEqual(media.progress.latest_downloaded_unit, 1);
          assert.deepStrictEqual(media.progress.next_missing_unit, 2);
          assert.deepStrictEqual(media.progress.missing, [2, 3]);
          assert.deepStrictEqual(media.score, 87);
          assert.deepStrictEqual(media.studios, ["Studio A"]);
          assert.deepStrictEqual(media.release_profile_ids, [1, 2]);
          assert.deepStrictEqual(media.genres, ["Action"]);
        }),
      schema,
    }),
);

it.scoped("MediaQueryService.listMedia fails when stored media JSON metadata is corrupt", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 10,
            titleRomaji: "Broken Show",
            rootFolder: "/test/10",
            format: "TV",
            status: "RELEASING",
            genres: "not-json",
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            studios: "[]",
          }),
        );

        const result = yield* Effect.exit(
          Effect.gen(function* () {
            const service = yield* MediaQueryService.pipe(
              Effect.provide(makeQueryServiceLayer(appDb)),
            );
            return yield* service.listMedia();
          }),
        );
        assert.deepStrictEqual(Exit.isFailure(result), true);
        if (Exit.isFailure(result)) {
          const failure = Cause.failureOption(result.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value instanceof StoredDataError, true);
            assert.match(failure.value.message, /genres/i);
          }
        }
      }),
    schema,
  }),
);
