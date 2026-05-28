import { assert, it } from "@effect/vitest";
import { Effect, Layer, TestClock } from "effect";

import * as schema from "@/db/schema.ts";
import { AppDrizzleDatabase } from "@/db/database.ts";
import { CatalogLibraryReadService } from "@/features/operations/catalog/catalog-library-read-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  makeMediaReadRepository,
  MediaReadRepository,
} from "@/features/media/shared/media-read-repository.ts";

it.scoped("getWantedMissing includes non-media units without air dates", () =>
  withSqliteTestDbEffect({
    schema,
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        yield* tryDatabasePromise("Failed to seed media for catalog test", () =>
          db
            .insert(schema.media)
            .values([
              animeRow({ id: 1, mediaKind: "anime", titleRomaji: "Media" }),
              animeRow({ id: 2, mediaKind: "manga", titleRomaji: "Manga" }),
            ]),
        );
        yield* tryDatabasePromise("Failed to seed mediaUnits for catalog test", () =>
          db.insert(schema.mediaUnits).values([
            { aired: "2025-01-01T00:00:00.000Z", mediaId: 1, downloaded: false, number: 1 },
            { aired: null, mediaId: 2, downloaded: false, number: 1 },
          ]),
        );

        yield* TestClock.setTime(new Date("2025-02-01T00:00:00.000Z").getTime());

        const dependenciesLayer = Layer.mergeAll(
          Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
          Layer.succeed(MediaReadRepository, makeMediaReadRepository(db)),
          Layer.succeed(
            RuntimeConfigSnapshotService,
            RuntimeConfigSnapshotService.make({
              getRuntimeConfig: () => Effect.succeed(makeTestConfig(databaseFile)),
              replaceRuntimeConfig: () => Effect.void,
            }),
          ),
        );
        const serviceLayer = CatalogLibraryReadService.DefaultWithoutDependencies.pipe(
          Layer.provide(dependenciesLayer),
        );

        const wanted = yield* Effect.gen(function* () {
          const service = yield* CatalogLibraryReadService;
          return yield* service.getWantedMissing(10);
        }).pipe(Effect.provide(serviceLayer));

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
    rootFolder: `/library/${input.titleRomaji}`,
    status: "FINISHED",
    studios: "[]",
    titleRomaji: input.titleRomaji,
  };
}
