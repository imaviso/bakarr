import { assert, it } from "@effect/vitest";
import type { AppDatabase } from "@/db/database.ts";

import * as schema from "@/db/schema.ts";
import { media, qualityProfiles } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import type { DbExecutor } from "@/infra/effect/db.ts";
import {
  checkProfileExistsEffect,
  checkRootFolderNotOwnedEffect,
  checkMediaExistsEffect,
} from "@/features/media/add/media-add-validation.ts";
import { MediaConflictError, MediaNotFoundError } from "@/features/media/errors.ts";
import { makeMediaRepository, makeQualityProfileRepository } from "@/test/repository-factories.ts";
import { Cause, Effect, Exit, Option } from "effect";

type TestDatabase = AppDatabase;

function seedAnime(db: TestDatabase, exec: DbExecutor) {
  return exec.runQuery(
    "Failed to seed test anime for validation",
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
        rootFolder: "/library/Existing",
        status: "FINISHED",
        studios: "[]",
        titleRomaji: "Existing Media",
      })
      .prepare()
      .effect(),
  );
}

function seedQualityProfile(db: TestDatabase, exec: DbExecutor) {
  return exec.runQuery(
    "Failed to seed quality profile for validation",
    db
      .insert(qualityProfiles)
      .values({
        allowedQualities: "[]",
        cutoff: "1080p",
        maxSize: null,
        minSize: null,
        name: "Default",
        seadexPreferred: false,
        upgradeAllowed: true,
      })
      .prepare()
      .effect(),
  );
}

it.effect("checkProfileExistsEffect returns true when profile exists", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedQualityProfile(db, exec);
        const exit = yield* Effect.exit(
          checkProfileExistsEffect(makeQualityProfileRepository(db, client), "Default"),
        );
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.effect("checkProfileExistsEffect returns MediaNotFoundError for missing profile", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          checkProfileExistsEffect(makeQualityProfileRepository(db, client), "Missing"),
        );
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findErrorOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof MediaNotFoundError);
          assert.deepStrictEqual(failure.value.message, "Quality profile 'Missing' not found");
        }
      }),
    schema,
  }),
);

it.effect("checkMediaExistsEffect returns MediaConflictError when media exists", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const exit = yield* Effect.exit(checkMediaExistsEffect(makeMediaRepository(db, client), 1));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findErrorOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof MediaConflictError);
          assert.deepStrictEqual(failure.value.message, "Media already exists");
        }
      }),
    schema,
  }),
);

it.effect("checkMediaExistsEffect succeeds when media does not exist", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          checkMediaExistsEffect(makeMediaRepository(db, client), 999),
        );
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.effect("checkRootFolderNotOwnedEffect returns error when folder already mapped", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const exit = yield* Effect.exit(
          checkRootFolderNotOwnedEffect(makeMediaRepository(db, client), "/library/Existing"),
        );
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findErrorOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof MediaConflictError);
          assert.deepStrictEqual(
            failure.value.message,
            "Folder is already mapped to Existing Media",
          );
        }
      }),
    schema,
  }),
);

it.effect("checkRootFolderNotOwnedEffect succeeds for unmapped folder", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const exit = yield* Effect.exit(
          checkRootFolderNotOwnedEffect(makeMediaRepository(db, client), "/library/NewAnime"),
        );
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.effect("listUnitRowsByMediaId returns empty when no mediaUnits", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      Effect.gen(function* () {
        yield* seedAnime(db, exec);
        const rows = yield* makeMediaRepository(db, client).listUnitRowsByMediaId(1);
        assert.deepStrictEqual(rows, []);
      }),
    schema,
  }),
);
