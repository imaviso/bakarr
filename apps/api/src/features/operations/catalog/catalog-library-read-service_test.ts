import * as TestClock from "effect/testing/TestClock";
import { Effect } from "effect";
import { assert, it } from "@effect/vitest";

import * as schema from "@/db/schema.ts";
import { tryDatabaseQuery } from "@/infra/effect/db.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { makeMediaRepository } from "@/test/repository-factories.ts";

it.effect("listWantedMissing includes non-media units without air dates", () =>
  withSqliteTestDbEffect({
    schema,
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        yield* tryDatabaseQuery(
          "Failed to seed media for catalog test",
          db
            .insert(schema.media)
            .values([
              animeRow({ id: 1, mediaKind: "anime", titleRomaji: "Media" }),
              animeRow({ id: 2, mediaKind: "manga", titleRomaji: "Manga" }),
            ])
            .prepare()
            .effect(),
        );
        yield* tryDatabaseQuery(
          "Failed to seed mediaUnits for catalog test",
          db
            .insert(schema.mediaUnits)
            .values([
              { aired: "2025-01-01T00:00:00.000Z", mediaId: 1, downloaded: false, number: 1 },
              { aired: null, mediaId: 2, downloaded: false, number: 1 },
            ])
            .prepare()
            .effect(),
        );

        yield* TestClock.setTime(new Date("2025-02-01T00:00:00.000Z").getTime());

        const mediaRead = makeMediaRepository(db, client);
        const wanted = yield* mediaRead.listWantedMissing(10, "2025-02-01T00:00:00.000Z");

        assert.deepStrictEqual(
          wanted.map((row) => ({ title: row.media_title, unitKind: row.unit_kind })),
          [
            { title: "Media", unitKind: "episode" },
            { title: "Manga", unitKind: "volume" },
          ],
        );
      }),
  }),
);

function animeRow(input: {
  readonly id: number;
  readonly mediaKind: string;
  readonly titleRomaji: string;
}): typeof schema.media.$inferInsert {
  return {
    addedAt: "2025-01-01T00:00:00.000Z",
    format: "TV",
    genres: "[]",
    id: input.id,
    mediaKind: input.mediaKind,
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: `/library/${input.id}`,
    status: "RELEASING",
    studios: "[]",
    titleEnglish: null,
    titleNative: null,
    titleRomaji: input.titleRomaji,
  };
}
