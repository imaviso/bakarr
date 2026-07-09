import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { makeMediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { MAX_INFERRED_EPISODE_NUMBER } from "@/features/media/units/unit-backfill-policy.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.scoped("backfillFromNextAiring inserts previous missing mediaUnits", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb);

        yield* tryDatabasePromise("Failed to seed media for backfill test", () =>
          appDb.insert(media).values({
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
          }),
        );

        yield* tryDatabasePromise("Failed to seed media for backfill test", () =>
          appDb.insert(mediaUnits).values({
            mediaId: 991,
            number: 2,
            aired: "2026-04-11T14:30:00.000Z",
            downloaded: false,
            filePath: null,
            title: null,
          }),
        );

        yield* units.backfillFromNextAiring({
          monitoredOnly: true,
        });

        const rows = yield* tryDatabasePromise(
          "Failed to query mediaUnits for backfill assertion",
          () =>
            appDb
              .select()
              .from(mediaUnits)
              .where(eq(mediaUnits.mediaId, 991))
              .orderBy(mediaUnits.number),
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

it.scoped("backfillFromNextAiring scopes to mediaId when provided", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb);

        yield* tryDatabasePromise("Failed to seed media for backfill test", () =>
          appDb.insert(media).values([
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
          ]),
        );

        yield* units.backfillFromNextAiring({
          mediaId: 991,
          monitoredOnly: false,
        });

        const rows = yield* tryDatabasePromise(
          "Failed to query mediaUnits for backfill assertion",
          () =>
            appDb
              .select({ mediaId: mediaUnits.mediaId, number: mediaUnits.number })
              .from(mediaUnits)
              .orderBy(mediaUnits.mediaId, mediaUnits.number),
        );

        assert.deepStrictEqual(rows, [{ mediaId: 991, number: 1 }]);
      }),
    schema,
  }),
);

it.scoped("backfillFromNextAiring caps inferred rows", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const units = makeMediaUnitRepository(appDb);

        yield* tryDatabasePromise("Failed to seed media for backfill test", () =>
          appDb.insert(media).values({
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
          }),
        );

        yield* units.backfillFromNextAiring({
          monitoredOnly: true,
        });

        const rows = yield* tryDatabasePromise(
          "Failed to query mediaUnits for backfill assertion",
          () =>
            appDb
              .select({ number: mediaUnits.number })
              .from(mediaUnits)
              .where(eq(mediaUnits.mediaId, 993))
              .orderBy(mediaUnits.number),
        );

        assert.deepStrictEqual(rows.length, MAX_INFERRED_EPISODE_NUMBER);
        assert.deepStrictEqual(rows[0]?.number, 1);
        assert.deepStrictEqual(rows[rows.length - 1]?.number, MAX_INFERRED_EPISODE_NUMBER);
      }),
    schema,
  }),
);
