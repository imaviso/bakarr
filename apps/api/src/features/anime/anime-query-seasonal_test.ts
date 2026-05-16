import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  brandAnimeId,
  resolveSeasonFromDate,
  resolveSeasonYearFromDate,
  type AnimeSeason,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { listSeasonalAnimeEffect } from "@/features/anime/anime-query-seasonal.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

describe("listSeasonalAnimeEffect", () => {
  it("resolves defaults from now + marks already_in_library", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.anime).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              episodeCount: 12,
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

          const now = new Date("2025-06-15T12:00:00Z");

          const result = yield* listSeasonalAnimeEffect({
            db: appDb,
            now,
            providerService: {
              getSeasonalAnime: (input: {
                season: AnimeSeason;
                year: number;
                limit: number;
                page: number;
              }) =>
                Effect.succeed({
                  degraded: false,
                  hasMore: true,
                  provider: "anilist" as const,
                  results: [
                    {
                      already_in_library: false,
                      format: "TV",
                      id: brandAnimeId(1),
                      season: input.season,
                      season_year: input.year,
                      start_year: input.year,
                      status: "RELEASING",
                      title: { romaji: "Winter Show" },
                    },
                    {
                      already_in_library: false,
                      format: "TV",
                      id: brandAnimeId(2),
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
            },
          });

          assert.deepStrictEqual(result.season, "summer");
          assert.deepStrictEqual(result.year, 2025);
          assert.deepStrictEqual(result.provider, "anilist");
          assert.deepStrictEqual(result.degraded, false);
          assert.deepStrictEqual(result.results.length, 2);
          assert.deepStrictEqual(result.results[0]?.already_in_library, true);
          assert.deepStrictEqual(result.results[1]?.already_in_library, false);
        }),
      schema,
    }));

  it("respects explicit season/year/limit", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;

          const result = yield* listSeasonalAnimeEffect({
            db: appDb,
            limit: 5,
            now: new Date("2025-06-15T12:00:00Z"),
            providerService: {
              getSeasonalAnime: (input) =>
                Effect.succeed({
                  degraded: true,
                  hasMore: false,
                  provider: "jikan_fallback" as const,
                  results: [
                    {
                      already_in_library: false,
                      format: "TV",
                      id: brandAnimeId(10),
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
            },
            season: "fall",
            year: 2024,
            page: 2,
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
    }));
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
