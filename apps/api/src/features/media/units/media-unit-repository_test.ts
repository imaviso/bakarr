import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/database.ts";

import * as schema from "@/db/schema.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import type { DbExecutor } from "@/infra/effect/db.ts";
import { makeMediaUnitRepository } from "@/test/repository-factories.ts";
import { Effect } from "effect";

type TestDatabase = AppDatabase;

function seedAnime(db: TestDatabase, exec: DbExecutor) {
  return exec.runQuery(
    "Failed to seed test anime",
    db
      .insert(media)
      .values({
        addedAt: "2025-01-01T00:00:00.000Z",
        unitCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        monitored: true,
        profileName: "Default",
        releaseProfileIds: "[]",
        rootFolder: "/library/Show",
        status: "FINISHED",
        studios: "[]",
        titleRomaji: "Show",
      })
      .returning()
      .prepare()
      .effect(),
  );
}

it.effect("clearUnitMapping clears episode file fields", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        const units = makeMediaUnitRepository(db, client);
        yield* seedAnime(db, exec);
        yield* units.upsertUnit(1, 3, {
          downloaded: true,
          filePath: "/library/Show/Show - 03.mkv",
          resolution: "1080p",
          videoCodec: "HEVC",
        });

        yield* units.clearUnitMapping(1, 3);

        const rows = yield* exec.runQuery(
          "Failed to query mediaUnits for assertion",
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)).prepare().effect(),
        );
        assert.deepStrictEqual(rows[0]?.downloaded, false);
        assert.deepStrictEqual(rows[0]?.filePath, null);
        assert.deepStrictEqual(rows[0]?.resolution, null);
        assert.deepStrictEqual(rows[0]?.videoCodec, null);
      }),
    schema,
  }),
);

it.effect("upsertUnit updates existing episode on conflict", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        const units = makeMediaUnitRepository(db, client);
        yield* seedAnime(db, exec);
        yield* units.upsertUnit(1, 2, {
          downloaded: true,
          filePath: "/library/Show/Show - 02.mkv",
          title: "Original",
        });
        yield* units.upsertUnit(1, 2, {
          downloaded: true,
          filePath: "/library/Show/Show - 02 v2.mkv",
          title: "Updated",
          resolution: "720p",
        });

        const rows = yield* exec.runQuery(
          "Failed to query mediaUnits for assertion",
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)).prepare().effect(),
        );
        assert.deepStrictEqual(rows.length, 1);
        assert.deepStrictEqual(rows[0]?.filePath, "/library/Show/Show - 02 v2.mkv");
        assert.deepStrictEqual(rows[0]?.title, "Updated");
        assert.deepStrictEqual(rows[0]?.resolution, "720p");
      }),
    schema,
  }),
);

it.effect("upsertUnit does not overwrite unspecified fields on conflict", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        const units = makeMediaUnitRepository(db, client);
        yield* seedAnime(db, exec);
        yield* units.upsertUnit(1, 4, {
          downloaded: true,
          filePath: "/library/Show/Show - 04.mkv",
          resolution: "1080p",
        });
        yield* units.upsertUnit(1, 4, {
          title: "New Title",
        });

        const rows = yield* exec.runQuery(
          "Failed to query mediaUnits for assertion",
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)).prepare().effect(),
        );
        assert.deepStrictEqual(rows.length, 1);
        assert.deepStrictEqual(rows[0]?.resolution, "1080p");
        assert.deepStrictEqual(rows[0]?.title, "New Title");
        assert.deepStrictEqual(rows[0]?.filePath, "/library/Show/Show - 04.mkv");
      }),
    schema,
  }),
);

it.effect("upsertUnit remap to a different file clears stale probe metadata", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        const units = makeMediaUnitRepository(db, client);
        yield* seedAnime(db, exec);
        yield* units.upsertUnit(1, 5, {
          downloaded: true,
          filePath: "/library/Show/Show - 05-old.mkv",
          audioChannels: "2.0",
          audioCodec: "AAC",
          durationSeconds: 1440,
          fileSize: 1234,
          groupName: "OldGroup",
          quality: "BluRay",
          resolution: "1080p",
          videoCodec: "HEVC",
        });

        yield* units.upsertUnit(1, 5, {
          downloaded: true,
          filePath: "/library/Show/Show - 05-new.mkv",
        });

        const rows = yield* exec.runQuery(
          "Failed to query mediaUnits for assertion",
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)).prepare().effect(),
        );
        assert.deepStrictEqual(rows[0]?.filePath, "/library/Show/Show - 05-new.mkv");
        assert.deepStrictEqual(rows[0]?.downloaded, true);
        assert.deepStrictEqual(rows[0]?.groupName, null);
        assert.deepStrictEqual(rows[0]?.resolution, null);
        assert.deepStrictEqual(rows[0]?.quality, null);
        assert.deepStrictEqual(rows[0]?.videoCodec, null);
        assert.deepStrictEqual(rows[0]?.audioCodec, null);
        assert.deepStrictEqual(rows[0]?.audioChannels, null);
        assert.deepStrictEqual(rows[0]?.durationSeconds, null);
        assert.deepStrictEqual(rows[0]?.fileSize, null);
      }),
    schema,
  }),
);

it.effect("upsertUnit same-path rewrite keeps cached probe metadata", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        const units = makeMediaUnitRepository(db, client);
        yield* seedAnime(db, exec);
        const filePath = "/library/Show/Show - 06.mkv";
        yield* units.upsertUnit(1, 6, {
          downloaded: true,
          filePath,
          groupName: "KeepGroup",
          resolution: "1080p",
        });

        yield* units.upsertUnit(1, 6, {
          downloaded: true,
          filePath,
        });

        const rows = yield* exec.runQuery(
          "Failed to query mediaUnits for assertion",
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)).prepare().effect(),
        );
        assert.deepStrictEqual(rows[0]?.groupName, "KeepGroup");
        assert.deepStrictEqual(rows[0]?.resolution, "1080p");
      }),
    schema,
  }),
);

it.effect("bulkMapUnitFiles remap to a different file clears stale probe metadata", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        const units = makeMediaUnitRepository(db, client);
        yield* seedAnime(db, exec);
        yield* units.upsertUnit(1, 7, {
          downloaded: true,
          filePath: "/library/Show/Show - 07-old.mkv",
          groupName: "OldGroup",
          resolution: "1080p",
        });

        yield* units.bulkMapUnitFiles(1, [
          { unit_number: 7, file_path: "/library/Show/Show - 07-new.mkv", clear: false },
        ]);

        const rows = yield* exec.runQuery(
          "Failed to query mediaUnits for assertion",
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)).prepare().effect(),
        );
        assert.deepStrictEqual(rows[0]?.filePath, "/library/Show/Show - 07-new.mkv");
        assert.deepStrictEqual(rows[0]?.groupName, null);
        assert.deepStrictEqual(rows[0]?.resolution, null);
      }),
    schema,
  }),
);
