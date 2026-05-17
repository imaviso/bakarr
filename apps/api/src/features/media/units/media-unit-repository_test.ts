import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { Effect } from "effect";

import * as schema from "@/db/schema.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  clearEpisodeMappingEffect,
  upsertEpisodeEffect,
} from "@/features/media/units/media-unit-repository.ts";

type TestDatabase = SqliteRemoteDatabase<typeof schema>;

function seedAnime(db: TestDatabase) {
  return Effect.promise(() =>
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
      .returning(),
  );
}

it.scoped("clearEpisodeMappingEffect clears episode file fields", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        yield* upsertEpisodeEffect(db, 1, 3, {
          downloaded: true,
          filePath: "/library/Show/Show - 03.mkv",
          resolution: "1080p",
          videoCodec: "HEVC",
        });

        yield* clearEpisodeMappingEffect(db, 1, 3);

        const rows = yield* Effect.promise(() =>
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)),
        );
        assert.deepStrictEqual(rows[0]?.downloaded, false);
        assert.deepStrictEqual(rows[0]?.filePath, null);
        assert.deepStrictEqual(rows[0]?.resolution, null);
        assert.deepStrictEqual(rows[0]?.videoCodec, null);
      }),
    schema,
  }),
);

it.scoped("upsertEpisodeEffect updates existing episode on conflict", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        yield* upsertEpisodeEffect(db, 1, 2, {
          downloaded: true,
          filePath: "/library/Show/Show - 02.mkv",
          title: "Original",
        });
        yield* upsertEpisodeEffect(db, 1, 2, {
          downloaded: true,
          filePath: "/library/Show/Show - 02 v2.mkv",
          title: "Updated",
          resolution: "720p",
        });

        const rows = yield* Effect.promise(() =>
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)),
        );
        assert.deepStrictEqual(rows.length, 1);
        assert.deepStrictEqual(rows[0]?.filePath, "/library/Show/Show - 02 v2.mkv");
        assert.deepStrictEqual(rows[0]?.title, "Updated");
        assert.deepStrictEqual(rows[0]?.resolution, "720p");
      }),
    schema,
  }),
);

it.scoped("upsertEpisodeEffect does not overwrite unspecified fields on conflict", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        yield* upsertEpisodeEffect(db, 1, 4, {
          downloaded: true,
          filePath: "/library/Show/Show - 04.mkv",
          resolution: "1080p",
        });
        yield* upsertEpisodeEffect(db, 1, 4, {
          title: "New Title",
        });

        const rows = yield* Effect.promise(() =>
          db.select().from(mediaUnits).where(eq(mediaUnits.id, 1)),
        );
        assert.deepStrictEqual(rows.length, 1);
        assert.deepStrictEqual(rows[0]?.resolution, "1080p");
        assert.deepStrictEqual(rows[0]?.title, "New Title");
        assert.deepStrictEqual(rows[0]?.filePath, "/library/Show/Show - 04.mkv");
      }),
    schema,
  }),
);
