import { assert, it } from "@effect/vitest";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { Cause, Effect, Exit, Option } from "effect";

import * as schema from "@/db/schema.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { makeMediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";

type TestDatabase = SqliteRemoteDatabase<typeof schema>;

function seedAnime(db: TestDatabase) {
  return tryDatabasePromise("Failed to seed test anime for read repository", () =>
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
        rootFolder: "/library/Naruto",
        status: "FINISHED",
        studios: "[]",
        titleRomaji: "Naruto",
      })
      .returning(),
  ).pipe(Effect.map((rows) => rows[0]!));
}

function seedEpisode(db: TestDatabase, mediaId: number, epNum: number) {
  return tryDatabasePromise("Failed to seed test episode", () =>
    db
      .insert(mediaUnits)
      .values({
        mediaId,
        downloaded: true,
        filePath: `/library/Naruto/Naruto - ${String(epNum).padStart(2, "0")}.mkv`,
        number: epNum,
        title: `MediaUnit ${epNum}`,
        aired: null,
      })
      .returning(),
  );
}

it.scoped("getMediaRowEffect returns row by id", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const repository = makeMediaRepository(db);
        const row = yield* repository.getMediaRow(1);
        assert.deepStrictEqual(row.titleRomaji, "Naruto");
        assert.deepStrictEqual(row.unitCount, 12);
      }),
    schema,
  }),
);

it.scoped("getMediaRowEffect fails with MediaNotFoundError for missing id", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repository = makeMediaRepository(db);
        const exit = yield* Effect.exit(repository.getMediaRow(999));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof MediaNotFoundError);
          assert.deepStrictEqual(failure.value.message, "Media not found");
        }
      }),
    schema,
  }),
);

it.scoped("requireMediaExistsEffect succeeds when media exists", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const repository = makeMediaRepository(db);
        const exit = yield* Effect.exit(repository.requireMediaExists(1));
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.scoped("getUnitRowEffect returns episode by media and number", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        yield* seedEpisode(db, 1, 5);
        const repository = makeMediaRepository(db);
        const row = yield* repository.getUnitRow(1, 5);
        assert.deepStrictEqual(row.number, 5);
        assert.deepStrictEqual(row.title, "MediaUnit 5");
      }),
    schema,
  }),
);

it.scoped("getUnitRowEffect fails for non-existent episode", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const repository = makeMediaRepository(db);
        const exit = yield* Effect.exit(repository.getUnitRow(1, 99));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof MediaNotFoundError);
          assert.deepStrictEqual(failure.value.message, "MediaUnit not found");
        }
      }),
    schema,
  }),
);

it.scoped("findMediaRootFolderOwnerEffect finds exact root match", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const repository = makeMediaRepository(db);
        const owner = yield* repository.findMediaRootFolderOwner("/library/Naruto");
        assert.ok(owner !== null);
        assert.deepStrictEqual(owner.titleRomaji, "Naruto");
      }),
    schema,
  }),
);

it.scoped("findMediaRootFolderOwnerEffect finds by child path match", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const repository = makeMediaRepository(db);
        const owner = yield* repository.findMediaRootFolderOwner("/library/Naruto/Season 1");
        assert.ok(owner !== null);
        assert.deepStrictEqual(owner.titleRomaji, "Naruto");
      }),
    schema,
  }),
);

it.scoped("findMediaRootFolderOwnerEffect returns null for no match", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repository = makeMediaRepository(db);
        const owner = yield* repository.findMediaRootFolderOwner("/library/Unknown");
        assert.deepStrictEqual(owner, null);
      }),
    schema,
  }),
);
