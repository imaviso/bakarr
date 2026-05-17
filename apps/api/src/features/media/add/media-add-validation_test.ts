import { assert, it } from "@effect/vitest";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { Cause, Effect, Exit, Option } from "effect";

import * as schema from "@/db/schema.ts";
import { media, qualityProfiles } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  checkProfileExistsEffect,
  checkRootFolderNotOwnedEffect,
  fetchPersistedEpisodeRowsEffect,
  checkAnimeExistsEffect,
} from "@/features/media/add/media-add-validation.ts";
import { MediaConflictError } from "@/features/media/errors.ts";
import { ProfileNotFoundError } from "@/features/system/errors.ts";

type TestDatabase = SqliteRemoteDatabase<typeof schema>;

function seedAnime(db: TestDatabase) {
  return Effect.promise(() =>
    db.insert(media).values({
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
    }),
  );
}

function seedQualityProfile(db: TestDatabase) {
  return Effect.promise(() =>
    db.insert(qualityProfiles).values({
      allowedQualities: "[]",
      cutoff: "1080p",
      maxSize: null,
      minSize: null,
      name: "Default",
      seadexPreferred: false,
      upgradeAllowed: true,
    }),
  );
}

it.scoped("checkProfileExistsEffect returns true when profile exists", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedQualityProfile(db);
        const exit = yield* Effect.exit(checkProfileExistsEffect(db, "Default"));
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.scoped("checkProfileExistsEffect returns ProfileNotFoundError for missing profile", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(checkProfileExistsEffect(db, "Missing"));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof ProfileNotFoundError);
          assert.deepStrictEqual(failure.value.message, "Quality profile 'Missing' not found");
        }
      }),
    schema,
  }),
);

it.scoped("checkAnimeExistsEffect returns MediaConflictError when media exists", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const exit = yield* Effect.exit(checkAnimeExistsEffect(db, 1));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof MediaConflictError);
          assert.deepStrictEqual(failure.value.message, "Media already exists");
        }
      }),
    schema,
  }),
);

it.scoped("checkAnimeExistsEffect succeeds when media does not exist", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(checkAnimeExistsEffect(db, 999));
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.scoped("checkRootFolderNotOwnedEffect returns error when folder already mapped", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const exit = yield* Effect.exit(checkRootFolderNotOwnedEffect(db, "/library/Existing"));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
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

it.scoped("checkRootFolderNotOwnedEffect succeeds for unmapped folder", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const exit = yield* Effect.exit(checkRootFolderNotOwnedEffect(db, "/library/NewAnime"));
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.scoped("fetchPersistedEpisodeRowsEffect returns empty when no mediaUnits", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const rows = yield* fetchPersistedEpisodeRowsEffect(db, 1);
        assert.deepStrictEqual(rows, []);
      }),
    schema,
  }),
);
