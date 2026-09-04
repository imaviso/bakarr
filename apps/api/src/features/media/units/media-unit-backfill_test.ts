import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { makeMediaUnitRepository } from "@/test/repository-factories.ts";
import { MAX_INFERRED_EPISODE_NUMBER } from "@/features/media/units/unit-backfill-policy.ts";
import { tryDatabaseQuery } from "@/infra/effect/db.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { Effect } from "effect";

it.effect("backfillFromNextAiring inserts previous missing mediaUnits", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb, client);

        yield* tryDatabaseQuery(
          "Failed to seed media for backfill test",
          appDb
            .insert(media)
            .values({
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
              nextAiringUnit: 2,
              addedAt: "2026-04-01T00:00:00.000Z",
              monitored: true,
            })
            .prepare()
            .effect(),
        );

        yield* tryDatabaseQuery(
          "Failed to seed media for backfill test",
          appDb
            .insert(mediaUnits)
            .values({
              mediaId: 991,
              number: 2,
              aired: "2026-04-11T14:30:00.000Z",
              downloaded: false,
              filePath: null,
              title: null,
            })
            .prepare()
            .effect(),
        );

        yield* units.backfillFromNextAiring({
          monitoredOnly: true,
        });

        const rows = yield* tryDatabaseQuery(
          "Failed to query mediaUnits for backfill assertion",
          appDb
            .select()
            .from(mediaUnits)
            .where(eq(mediaUnits.mediaId, 991))
            .orderBy(mediaUnits.number)
            .prepare()
            .effect(),
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

it.effect("backfillFromNextAiring scopes to mediaId when provided", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb, client);

        yield* tryDatabaseQuery(
          "Failed to seed media for backfill test",
          appDb
            .insert(media)
            .values([
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
                nextAiringUnit: 2,
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
                nextAiringUnit: 2,
                addedAt: "2026-04-01T00:00:00.000Z",
                monitored: false,
              },
            ])
            .prepare()
            .effect(),
        );

        yield* units.backfillFromNextAiring({
          mediaId: 991,
          monitoredOnly: false,
        });

        const rows = yield* tryDatabaseQuery(
          "Failed to query mediaUnits for backfill assertion",
          appDb
            .select({ mediaId: mediaUnits.mediaId, number: mediaUnits.number })
            .from(mediaUnits)
            .orderBy(mediaUnits.mediaId, mediaUnits.number)
            .prepare()
            .effect(),
        );

        assert.deepStrictEqual(rows, [{ mediaId: 991, number: 1 }]);
      }),
    schema,
  }),
);

it.effect("backfillFromNextAiring caps inferred rows", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb, client);

        yield* tryDatabaseQuery(
          "Failed to seed media for backfill test",
          appDb
            .insert(media)
            .values({
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
              nextAiringUnit: MAX_INFERRED_EPISODE_NUMBER + 500,
              addedAt: "2026-04-01T00:00:00.000Z",
              monitored: true,
            })
            .prepare()
            .effect(),
        );

        yield* units.backfillFromNextAiring({
          monitoredOnly: true,
        });

        const rows = yield* tryDatabaseQuery(
          "Failed to query mediaUnits for backfill assertion",
          appDb
            .select({ number: mediaUnits.number })
            .from(mediaUnits)
            .where(eq(mediaUnits.mediaId, 993))
            .orderBy(mediaUnits.number)
            .prepare()
            .effect(),
        );

        assert.deepStrictEqual(rows.length, MAX_INFERRED_EPISODE_NUMBER);
        assert.deepStrictEqual(rows[0]?.number, 1);
        assert.deepStrictEqual(rows[rows.length - 1]?.number, MAX_INFERRED_EPISODE_NUMBER);
      }),
    schema,
  }),
);
