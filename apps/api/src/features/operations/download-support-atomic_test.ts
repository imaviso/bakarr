import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { upsertEpisodeFilesAtomic } from "@/features/operations/download-support.ts";
import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.scoped("upsertEpisodeFilesAtomic inserts multiple episodes atomically", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
            id: 1,
            titleRomaji: "Test Show",
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

        yield* upsertEpisodeFilesAtomic(appDb, 1, [1, 2, 3], "/test/episode.mkv");

        const rows = yield* Effect.tryPromise(() =>
          appDb.select().from(schema.episodes).where(eq(schema.episodes.animeId, 1)),
        );
        assert.deepStrictEqual(rows.length, 3);

        const numbers = rows.map((r) => r.number).sort((a, b) => a - b);
        assert.deepStrictEqual(numbers, [1, 2, 3]);

        assert.deepStrictEqual(rows[0].downloaded, true);
        assert.deepStrictEqual(rows[0].filePath, "/test/episode.mkv");
      }),
    schema,
  }),
);

it.scoped("upsertEpisodeFilesAtomic updates existing episodes", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
            id: 1,
            titleRomaji: "Test Show",
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

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.episodes).values([
            { animeId: 1, number: 1, downloaded: false, filePath: null },
            { animeId: 1, number: 2, downloaded: true, filePath: "/old.mkv" },
          ]),
        );

        yield* upsertEpisodeFilesAtomic(appDb, 1, [1, 2], "/new.mkv");

        const rows = yield* Effect.tryPromise(() =>
          appDb
            .select()
            .from(schema.episodes)
            .where(eq(schema.episodes.animeId, 1))
            .orderBy(schema.episodes.number),
        );

        assert.deepStrictEqual(rows.length, 2);
        assert.deepStrictEqual(rows[0].downloaded, true);
        assert.deepStrictEqual(rows[0].filePath, "/new.mkv");
        assert.deepStrictEqual(rows[1].downloaded, true);
        assert.deepStrictEqual(rows[1].filePath, "/new.mkv");
      }),
    schema,
  }),
);

it.scoped("upsertEpisodeFilesAtomic handles empty episode list", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
            id: 1,
            titleRomaji: "Test Show",
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

        yield* upsertEpisodeFilesAtomic(appDb, 1, [], "/test/episode.mkv");

        const rows = yield* Effect.tryPromise(() => appDb.select().from(schema.episodes));
        assert.deepStrictEqual(rows.length, 0);
      }),
    schema,
  }),
);
