import { assert, it } from "@effect/vitest";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { Cause, Effect, Exit, Option } from "effect";

import * as schema from "@/db/schema.ts";
import { anime, episodes } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  getAnimeRowEffect,
  getEpisodeRowEffect,
  findAnimeRootFolderOwnerEffect,
  requireAnimeExistsEffect,
} from "@/features/anime/anime-read-repository.ts";
import { AnimeNotFoundError } from "@/features/anime/errors.ts";

type TestDatabase = SqliteRemoteDatabase<typeof schema>;

function seedAnime(db: TestDatabase) {
  return Effect.promise(() =>
    db
      .insert(anime)
      .values({
        addedAt: "2025-01-01T00:00:00.000Z",
        episodeCount: 12,
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

function seedEpisode(db: TestDatabase, animeId: number, epNum: number) {
  return Effect.promise(() =>
    db
      .insert(episodes)
      .values({
        animeId,
        downloaded: true,
        filePath: `/library/Naruto/Naruto - ${String(epNum).padStart(2, "0")}.mkv`,
        number: epNum,
        title: `Episode ${epNum}`,
        aired: null,
      })
      .returning(),
  );
}

it.scoped("getAnimeRowEffect returns row by id", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const row = yield* getAnimeRowEffect(db, 1);
        assert.deepStrictEqual(row.titleRomaji, "Naruto");
        assert.deepStrictEqual(row.episodeCount, 12);
      }),
    schema,
  }),
);

it.scoped("getAnimeRowEffect fails with AnimeNotFoundError for missing id", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(getAnimeRowEffect(db, 999));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof AnimeNotFoundError);
          assert.deepStrictEqual(failure.value.message, "Anime not found");
        }
      }),
    schema,
  }),
);

it.scoped("requireAnimeExistsEffect succeeds when anime exists", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const exit = yield* Effect.exit(requireAnimeExistsEffect(db, 1));
        assert.deepStrictEqual(exit._tag, "Success");
      }),
    schema,
  }),
);

it.scoped("getEpisodeRowEffect returns episode by anime and number", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        yield* seedEpisode(db, 1, 5);
        const row = yield* getEpisodeRowEffect(db, 1, 5);
        assert.deepStrictEqual(row.number, 5);
        assert.deepStrictEqual(row.title, "Episode 5");
      }),
    schema,
  }),
);

it.scoped("getEpisodeRowEffect fails for non-existent episode", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const exit = yield* Effect.exit(getEpisodeRowEffect(db, 1, 99));
        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
          assert.ok(Option.isSome(failure));
          assert.ok(failure.value instanceof AnimeNotFoundError);
          assert.deepStrictEqual(failure.value.message, "Episode not found");
        }
      }),
    schema,
  }),
);

it.scoped("findAnimeRootFolderOwnerEffect finds exact root match", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const owner = yield* findAnimeRootFolderOwnerEffect(db, "/library/Naruto");
        assert.ok(owner !== null);
        assert.deepStrictEqual(owner.titleRomaji, "Naruto");
      }),
    schema,
  }),
);

it.scoped("findAnimeRootFolderOwnerEffect finds by child path match", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* seedAnime(db);
        const owner = yield* findAnimeRootFolderOwnerEffect(db, "/library/Naruto/Season 1");
        assert.ok(owner !== null);
        assert.deepStrictEqual(owner.titleRomaji, "Naruto");
      }),
    schema,
  }),
);

it.scoped("findAnimeRootFolderOwnerEffect returns null for no match", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const owner = yield* findAnimeRootFolderOwnerEffect(db, "/library/Unknown");
        assert.deepStrictEqual(owner, null);
      }),
    schema,
  }),
);
