import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import * as schema from "@/db/schema.ts";
import { Database } from "@/db/database.ts";
import {
  CatalogLibraryReadService,
  CatalogLibraryReadServiceLive,
} from "@/features/operations/catalog/catalog-library-read-service.ts";
import { ClockService } from "@/infra/clock.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.scoped("getWantedMissing includes non-anime units without air dates", () =>
  withSqliteTestDbEffect({
    schema,
    run: (db, databaseFile, client) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db
            .insert(schema.anime)
            .values([
              animeRow({ id: 1, mediaKind: "anime", titleRomaji: "Anime" }),
              animeRow({ id: 2, mediaKind: "manga", titleRomaji: "Manga" }),
            ]),
        );
        yield* Effect.promise(() =>
          db.insert(schema.episodes).values([
            { aired: "2025-01-01T00:00:00.000Z", animeId: 1, downloaded: false, number: 1 },
            { aired: null, animeId: 2, downloaded: false, number: 1 },
          ]),
        );

        const wanted = yield* Effect.gen(function* () {
          const service = yield* CatalogLibraryReadService;
          return yield* service.getWantedMissing(10);
        }).pipe(
          Effect.provide(
            CatalogLibraryReadServiceLive.pipe(
              Layer.provide(
                Layer.mergeAll(
                  Layer.succeed(Database, { client, db }),
                  Layer.succeed(ClockService, {
                    currentMonotonicMillis: Effect.succeed(0),
                    currentTimeMillis: Effect.succeed(
                      new Date("2025-02-01T00:00:00.000Z").getTime(),
                    ),
                  }),
                  Layer.succeed(RuntimeConfigSnapshotService, {
                    getRuntimeConfig: () => Effect.succeed(makeTestConfig(databaseFile)),
                    replaceRuntimeConfig: () => Effect.void,
                  }),
                ),
              ),
            ),
          ),
        );

        assert.deepStrictEqual(
          wanted.map((row) => ({ title: row.anime_title, unitKind: row.unit_kind })),
          [
            { title: "Anime", unitKind: "episode" },
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
}): typeof schema.anime.$inferInsert {
  return {
    addedAt: "2025-01-01T00:00:00.000Z",
    format: "TV",
    genres: "[]",
    id: input.id,
    mediaKind: input.mediaKind,
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: `/library/${input.titleRomaji}`,
    status: "FINISHED",
    studios: "[]",
    titleRomaji: input.titleRomaji,
  };
}
