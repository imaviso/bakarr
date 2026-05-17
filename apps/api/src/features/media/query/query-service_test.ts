import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { brandMediaId, type MediaSearchResult } from "@packages/shared/index.ts";
import { ClockService } from "@/infra/clock.ts";
import * as schema from "@/db/schema.ts";
import { AnimeQueryService, AnimeQueryServiceLive } from "@/features/media/query/query-service.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { AnimeSeasonalProviderService } from "@/features/media/query/media-seasonal-provider-service.ts";
import { Database } from "@/db/database.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";

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

describe("AnimeQueryService.listSeasonalAnime", () => {
  it.scoped("uses db cache within ttl and skips provider call", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client) =>
        Effect.gen(function* () {
          let providerCalls = 0;

          const providerLayer = Layer.succeed(AnimeSeasonalProviderService, {
            getSeasonalAnime: () => {
              providerCalls += 1;
              return Effect.succeed({
                degraded: false,
                hasMore: false,
                provider: "anilist" as const,
                results: [makeSeasonalResult({ id: 42, title: "Cached Spring" })],
                season: "spring" as const,
                year: 2025,
              });
            },
          });

          const baseLayer = Layer.mergeAll(
            providerLayer,
            Layer.succeed(AniListClient, {
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.succeed([]),
              searchAnimeMetadata: () => Effect.succeed([]),
            }),
            Layer.succeed(ManamiClient, {
              getByAniListId: () => Effect.succeed(Option.none()),
              getByMalId: () => Effect.succeed(Option.none()),
              resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
              resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
              searchAnime: () => Effect.succeed([]),
            }),
            Layer.succeed(ClockService, {
              currentMonotonicMillis: Effect.succeed(0),
              currentTimeMillis: Effect.succeed(new Date("2025-04-01T10:00:00.000Z").getTime()),
            }),
            Layer.succeed(Database, {
              client,
              db,
            }),
          );

          const queryServiceLayer = AnimeQueryServiceLive.pipe(Layer.provide(baseLayer));

          const listSeasonalAnime = (input: {
            season: "spring";
            year: number;
            page: number;
            limit: number;
          }) =>
            Effect.gen(function* () {
              const service = yield* AnimeQueryService;
              return yield* service.listSeasonalAnime(input);
            }).pipe(Effect.provide(queryServiceLayer));

          const first = yield* listSeasonalAnime({
            limit: 12,
            page: 1,
            season: "spring",
            year: 2025,
          });

          assert.deepStrictEqual(first.results.length, 1);
          assert.deepStrictEqual(providerCalls, 1);

          const second = yield* listSeasonalAnime({
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
      run: (db, _databaseFile, client) =>
        Effect.gen(function* () {
          let providerCalls = 0;
          let currentTime = new Date("2025-04-01T10:00:00.000Z").getTime();

          const providerLayer = Layer.succeed(AnimeSeasonalProviderService, {
            getSeasonalAnime: () => {
              providerCalls += 1;
              return Effect.succeed({
                degraded: false,
                hasMore: false,
                provider: "anilist" as const,
                results: [makeSeasonalResult({ id: 7, title: `Fetch ${providerCalls}` })],
                season: "spring" as const,
                year: 2025,
              });
            },
          });

          const layer = AnimeQueryServiceLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                providerLayer,
                Layer.succeed(AniListClient, {
                  getAnimeMetadataById: () => Effect.succeed(Option.none()),
                  getSeasonalAnime: () => Effect.succeed([]),
                  searchAnimeMetadata: () => Effect.succeed([]),
                }),
                Layer.succeed(ManamiClient, {
                  getByAniListId: () => Effect.succeed(Option.none()),
                  getByMalId: () => Effect.succeed(Option.none()),
                  resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                  resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                  searchAnime: () => Effect.succeed([]),
                }),
                Layer.succeed(ClockService, {
                  currentMonotonicMillis: Effect.succeed(0),
                  currentTimeMillis: Effect.sync(() => currentTime),
                }),
                Layer.succeed(Database, {
                  client,
                  db,
                }),
              ),
            ),
          );

          const service = yield* AnimeQueryService.pipe(Effect.provide(layer));

          yield* service.listSeasonalAnime({ season: "spring", year: 2025, page: 1, limit: 12 });
          assert.deepStrictEqual(providerCalls, 1);

          currentTime += 1000 * 60 * 6;
          const refreshed = yield* service.listSeasonalAnime({
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
      run: (db, _databaseFile, client) =>
        Effect.gen(function* () {
          let providerCalls = 0;
          let currentTime = new Date("2025-04-01T10:00:00.000Z").getTime();

          const providerLayer = Layer.succeed(AnimeSeasonalProviderService, {
            getSeasonalAnime: () => {
              providerCalls += 1;

              if (providerCalls === 1) {
                return Effect.succeed({
                  degraded: false,
                  hasMore: false,
                  provider: "anilist" as const,
                  results: [makeSeasonalResult({ id: 9, title: "Stale Spring" })],
                  season: "spring" as const,
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
          });

          const layer = AnimeQueryServiceLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                providerLayer,
                Layer.succeed(AniListClient, {
                  getAnimeMetadataById: () => Effect.succeed(Option.none()),
                  getSeasonalAnime: () => Effect.succeed([]),
                  searchAnimeMetadata: () => Effect.succeed([]),
                }),
                Layer.succeed(ManamiClient, {
                  getByAniListId: () => Effect.succeed(Option.none()),
                  getByMalId: () => Effect.succeed(Option.none()),
                  resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                  resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                  searchAnime: () => Effect.succeed([]),
                }),
                Layer.succeed(ClockService, {
                  currentMonotonicMillis: Effect.succeed(0),
                  currentTimeMillis: Effect.sync(() => currentTime),
                }),
                Layer.succeed(Database, {
                  client,
                  db,
                }),
              ),
            ),
          );

          const service = yield* AnimeQueryService.pipe(Effect.provide(layer));

          yield* service.listSeasonalAnime({ season: "spring", year: 2025, page: 1, limit: 12 });
          currentTime += 1000 * 60 * 6;

          const stale = yield* service.listSeasonalAnime({
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
});

describe("AnimeQueryService.searchAnime", () => {
  it.scoped("falls back to Manami local search when AniList search fails", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client) =>
        Effect.gen(function* () {
          const layer = AnimeQueryServiceLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.succeed(AnimeSeasonalProviderService, {
                  getSeasonalAnime: () =>
                    Effect.succeed({
                      degraded: false,
                      hasMore: false,
                      provider: "anilist" as const,
                      results: [],
                      season: "spring" as const,
                      year: 2025,
                    }),
                }),
                Layer.succeed(AniListClient, {
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
                Layer.succeed(ManamiClient, {
                  getByAniListId: () => Effect.succeed(Option.none()),
                  getByMalId: () => Effect.succeed(Option.none()),
                  resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
                  resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
                  searchAnime: () =>
                    Effect.succeed([
                      {
                        already_in_library: false,
                        id: brandMediaId(1001),
                        synonyms: ["Alpha Alias"],
                        title: { english: "Alpha", romaji: "Alpha" },
                      },
                    ]),
                }),
                Layer.succeed(ClockService, {
                  currentMonotonicMillis: Effect.succeed(0),
                  currentTimeMillis: Effect.succeed(new Date("2025-04-01T10:00:00.000Z").getTime()),
                }),
                Layer.succeed(Database, {
                  client,
                  db,
                }),
              ),
            ),
          );

          const service = yield* AnimeQueryService.pipe(Effect.provide(layer));
          const result = yield* service.searchAnime("Alpha Alias");

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
