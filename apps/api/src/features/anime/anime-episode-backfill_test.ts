import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { anime, episodes } from "@/db/schema.ts";
import { backfillEpisodesFromNextAiringEffect } from "@/features/anime/anime-episode-backfill.ts";
import { MAX_INFERRED_EPISODE_NUMBER } from "@/features/anime/episode-backfill-policy.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.scoped("backfillEpisodesFromNextAiringEffect inserts previous missing episodes", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;

        yield* Effect.promise(() =>
          appDb.insert(anime).values({
            id: 991,
            titleRomaji: "Backfill Show",
            rootFolder: "/test/backfill-show",
            format: "TV",
            status: "RELEASING",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            nextAiringAt: "2026-04-11T14:30:00.000Z",
            nextAiringEpisode: 2,
            addedAt: "2026-04-01T00:00:00.000Z",
            monitored: true,
          }),
        );

        yield* Effect.promise(() =>
          appDb.insert(episodes).values({
            animeId: 991,
            number: 2,
            aired: "2026-04-11T14:30:00.000Z",
            downloaded: false,
            filePath: null,
            title: null,
          }),
        );

        yield* backfillEpisodesFromNextAiringEffect({
          db: appDb,
          monitoredOnly: true,
        });

        const rows = yield* Effect.promise(() =>
          appDb.select().from(episodes).where(eq(episodes.animeId, 991)).orderBy(episodes.number),
        );

        assert.deepStrictEqual(
          rows.map((row) => ({ aired: row.aired, number: row.number })),
          [
            { aired: "2026-04-04T14:30:00.000Z", number: 1 },
            { aired: "2026-04-11T14:30:00.000Z", number: 2 },
          ],
        );
      }),
    schema,
  }),
);

it.scoped("backfillEpisodesFromNextAiringEffect scopes to animeId when provided", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;

        yield* Effect.promise(() =>
          appDb.insert(anime).values([
            {
              id: 991,
              titleRomaji: "Backfill Show A",
              rootFolder: "/test/backfill-show-a",
              format: "TV",
              status: "RELEASING",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              nextAiringAt: "2026-04-11T14:30:00.000Z",
              nextAiringEpisode: 2,
              addedAt: "2026-04-01T00:00:00.000Z",
              monitored: false,
            },
            {
              id: 992,
              titleRomaji: "Backfill Show B",
              rootFolder: "/test/backfill-show-b",
              format: "TV",
              status: "RELEASING",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              nextAiringAt: "2026-04-11T14:30:00.000Z",
              nextAiringEpisode: 2,
              addedAt: "2026-04-01T00:00:00.000Z",
              monitored: false,
            },
          ]),
        );

        yield* backfillEpisodesFromNextAiringEffect({
          animeId: 991,
          db: appDb,
          monitoredOnly: false,
        });

        const rows = yield* Effect.promise(() =>
          appDb
            .select({ animeId: episodes.animeId, number: episodes.number })
            .from(episodes)
            .orderBy(episodes.animeId, episodes.number),
        );

        assert.deepStrictEqual(rows, [{ animeId: 991, number: 1 }]);
      }),
    schema,
  }),
);

it.scoped("backfillEpisodesFromNextAiringEffect caps inferred rows", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;

        yield* Effect.promise(() =>
          appDb.insert(anime).values({
            id: 993,
            titleRomaji: "Backfill Long Show",
            rootFolder: "/test/backfill-long-show",
            format: "TV",
            status: "RELEASING",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            nextAiringAt: "2026-04-11T14:30:00.000Z",
            nextAiringEpisode: MAX_INFERRED_EPISODE_NUMBER + 500,
            addedAt: "2026-04-01T00:00:00.000Z",
            monitored: true,
          }),
        );

        yield* backfillEpisodesFromNextAiringEffect({
          db: appDb,
          monitoredOnly: true,
        });

        const rows = yield* Effect.promise(() =>
          appDb
            .select({ number: episodes.number })
            .from(episodes)
            .where(eq(episodes.animeId, 993))
            .orderBy(episodes.number),
        );

        assert.deepStrictEqual(rows.length, MAX_INFERRED_EPISODE_NUMBER);
        assert.deepStrictEqual(rows[0]?.number, 1);
        assert.deepStrictEqual(rows[rows.length - 1]?.number, MAX_INFERRED_EPISODE_NUMBER);
      }),
    schema,
  }),
);
