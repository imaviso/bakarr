import { assert, it } from "@effect/vitest";
import type { AppDatabase } from "@/db/database.ts";

import * as schema from "@/db/schema.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import type { DbExecutor } from "@/infra/effect/db.ts";
import { makeMediaRepository } from "@/test/repository-factories.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { Cause, Effect, Exit, Option } from "effect";

type TestDatabase = AppDatabase;

function seedAnime(db: TestDatabase, exec: DbExecutor) {
  return exec
    .runQuery(
      "Failed to seed test anime for read repository",
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
        .returning()
        .prepare()
        .effect(),
    )
    .pipe(Effect.map((rows) => rows[0]!));
}

function seedEpisode(db: TestDatabase, exec: DbExecutor, mediaId: number, epNum: number) {
  return exec.runQuery(
    "Failed to seed test episode",
    db
      .insert(mediaUnits)
      .values({
        mediaId,
        downloaded: true,
        filePath: `/library/Naruto/Naruto - ${globalThis.String(epNum).padStart(2, "0")}.mkv`,
        number: epNum,
        title: `MediaUnit ${epNum}`,
        aired: null,
      })
      .returning()
      .prepare()
      .effect(),
  );
}

it.effect("getMediaRowEffect returns row by id", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const repository = makeMediaRepository(db, client);
        const row = yield* repository.getMediaRow(1);
        assert.deepStrictEqual(row.titleRomaji, "Naruto");
        assert.deepStrictEqual(row.unitCount, 12);
      }),
    schema,
  }),
);

it.effect("getMediaRowEffect fails with MediaNotFoundError for missing id", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const repository = makeMediaRepository(db, client);
        const exit = yield* Effect.exit(repository.getMediaRow(999));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findErrorOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof MediaNotFoundError);
          assert.deepStrictEqual(failure.value.message, "Media not found");
        }
      }),
    schema,
  }),
);

it.effect("requireMediaExistsEffect succeeds when media exists", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const repository = makeMediaRepository(db, client);
        const exit = yield* Effect.exit(repository.requireMediaExists(1));
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.effect("getUnitRowEffect returns episode by media and number", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        yield* seedEpisode(db, exec, 1, 5);
        const repository = makeMediaRepository(db, client);
        const row = yield* repository.getUnitRow(1, 5);
        assert.deepStrictEqual(row.number, 5);
        assert.deepStrictEqual(row.title, "MediaUnit 5");
      }),
    schema,
  }),
);

it.effect("getUnitRowEffect fails for non-existent episode", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const repository = makeMediaRepository(db, client);
        const exit = yield* Effect.exit(repository.getUnitRow(1, 99));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findErrorOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof MediaNotFoundError);
          assert.deepStrictEqual(failure.value.message, "MediaUnit not found");
        }
      }),
    schema,
  }),
);

it.effect("findMediaRootFolderOwnerEffect finds exact root match", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const repository = makeMediaRepository(db, client);
        const owner = yield* repository.findMediaRootFolderOwner("/library/Naruto");
        assert.ok(owner !== null);
        assert.deepStrictEqual(owner.titleRomaji, "Naruto");
      }),
    schema,
  }),
);

it.effect("findMediaRootFolderOwnerEffect finds by child path match", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const repository = makeMediaRepository(db, client);
        const owner = yield* repository.findMediaRootFolderOwner("/library/Naruto/Season 1");
        assert.ok(owner !== null);
        assert.deepStrictEqual(owner.titleRomaji, "Naruto");
      }),
    schema,
  }),
);

it.effect("findMediaRootFolderOwnerEffect returns null for no match", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const repository = makeMediaRepository(db, client);
        const owner = yield* repository.findMediaRootFolderOwner("/library/Unknown");
        assert.deepStrictEqual(owner, null);
      }),
    schema,
  }),
);
