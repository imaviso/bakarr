import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";

import { makeMediaUnitRepository } from "@/test/repository-factories.ts";
import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { tryDatabaseQuery } from "@/infra/effect/db.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { Effect } from "effect";

it.effect("upsertUnitFiles inserts multiple mediaUnits atomically", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb, client);

        yield* tryDatabaseQuery(
          "Failed test database setup",
          appDb
            .insert(schema.media)
            .values({
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
            })
            .prepare()
            .effect(),
        );

        yield* units.upsertUnitFiles(1, [1, 2, 3], "/test/episode.mkv");

        const rows = yield* tryDatabaseQuery(
          "Failed test database assertion",
          appDb
            .select()
            .from(schema.mediaUnits)
            .where(eq(schema.mediaUnits.mediaId, 1))
            .prepare()
            .effect(),
        );
        assert.deepStrictEqual(rows.length, 3);
        const numbers = rows.map((r) => r.number).toSorted((a, b) => a - b);
        assert.deepStrictEqual(numbers, [1, 2, 3]);

        for (const row of rows) {
          assert.deepStrictEqual(row.downloaded, true);
          assert.deepStrictEqual(row.filePath, "/test/episode.mkv");
        }
      }),
    schema,
  }),
);

it.effect("upsertUnitFiles updates existing mediaUnits", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb, client);

        yield* tryDatabaseQuery(
          "Failed test database setup",
          appDb
            .insert(schema.media)
            .values({
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
            })
            .prepare()
            .effect(),
        );

        yield* tryDatabaseQuery(
          "Failed test database setup",
          appDb
            .insert(schema.mediaUnits)
            .values([
              { mediaId: 1, number: 1, downloaded: false, filePath: null },
              { mediaId: 1, number: 2, downloaded: true, filePath: "/old.mkv" },
            ])
            .prepare()
            .effect(),
        );

        yield* units.upsertUnitFiles(1, [1, 2], "/new.mkv");

        const rows = yield* tryDatabaseQuery(
          "Failed test database assertion",
          appDb
            .select()
            .from(schema.mediaUnits)
            .where(eq(schema.mediaUnits.mediaId, 1))
            .orderBy(schema.mediaUnits.number)
            .prepare()
            .effect(),
        );

        assert.deepStrictEqual(rows.length, 2);
        const [firstRow, secondRow] = rows;
        assert.deepStrictEqual(firstRow !== undefined, true);
        assert.deepStrictEqual(secondRow !== undefined, true);
        if (!firstRow || !secondRow) {
          return;
        }
        assert.deepStrictEqual(firstRow.downloaded, true);
        assert.deepStrictEqual(firstRow.filePath, "/new.mkv");
        assert.deepStrictEqual(secondRow.downloaded, true);
        assert.deepStrictEqual(secondRow.filePath, "/new.mkv");
      }),
    schema,
  }),
);

it.effect("upsertUnitFiles handles empty episode list", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb, client);

        yield* tryDatabaseQuery(
          "Failed test database setup",
          appDb
            .insert(schema.media)
            .values({
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
            })
            .prepare()
            .effect(),
        );

        yield* units.upsertUnitFiles(1, [], "/test/episode.mkv");

        const rows = yield* tryDatabaseQuery(
          "Failed test database assertion",
          appDb.select().from(schema.mediaUnits).prepare().effect(),
        );
        assert.deepStrictEqual(rows.length, 0);
      }),
    schema,
  }),
);
