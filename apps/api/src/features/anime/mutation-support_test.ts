import { eq } from "drizzle-orm";
import { appConfig, anime } from "../../db/schema.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { withFileSystemSandboxEffect } from "../../test/filesystem-test.ts";
import { withSqliteTestDbEffect } from "../../test/database-test.ts";
import { assertEquals, assertInstanceOf, it } from "../../test/vitest.ts";
import { Cause, Effect, Exit } from "effect";

import * as schema from "../../db/schema.ts";
import { AnimePathError } from "./errors.ts";
import { updateAnimePathEffect } from "./mutation-support.ts";
import { encodeConfigCore } from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";

it.scoped("updateAnimePathEffect accepts paths inside the configured library root", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const libraryRoot = `${root}/library`;
          const currentRoot = `${libraryRoot}/Naruto`;
          const requestedRoot = `${libraryRoot}/One Piece`;

          yield* fs.mkdir(currentRoot, { recursive: true });

          const config = makeDefaultConfig(databaseFile);
          config.library.library_path = libraryRoot;

          yield* Effect.promise(() =>
            db.insert(appConfig).values({
              data: encodeConfigCore(config),
              id: 1,
              updatedAt: "2024-01-01T00:00:00.000Z",
            }),
          );

          yield* Effect.promise(() =>
            db.insert(anime).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              bannerImage: null,
              coverImage: null,
              description: null,
              endDate: null,
              endYear: null,
              episodeCount: 12,
              format: "TV",
              genres: "[]",
              id: 20,
              malId: null,
              monitored: true,
              nextAiringAt: null,
              nextAiringEpisode: null,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: currentRoot,
              score: null,
              startDate: null,
              startYear: null,
              status: "RELEASING",
              studios: "[]",
              titleEnglish: null,
              titleNative: null,
              titleRomaji: "Naruto",
            }),
          );

          const exit = yield* Effect.exit(
            updateAnimePathEffect({
              db,
              fs,
              id: 20,
              nowIso: () => Effect.succeed("2024-01-02T00:00:00.000Z"),
              path: requestedRoot,
            }),
          );

          assertEquals(exit._tag, "Success");

          const [updatedAnime] = yield* Effect.promise(() =>
            db.select().from(anime).where(eq(anime.id, 20)).limit(1),
          );

          const canonicalRequestedRoot = yield* fs.realPath(requestedRoot);
          assertEquals(updatedAnime?.rootFolder, canonicalRequestedRoot);

          const requestedRootStat = yield* fs.stat(requestedRoot);
          assertEquals(requestedRootStat.isDirectory, true);
        }),
      schema,
    }),
  ),
);

it.scoped("updateAnimePathEffect rejects paths outside the configured library root", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const libraryRoot = `${root}/library`;
          const currentRoot = `${libraryRoot}/Naruto`;
          const requestedRoot = `${root}/outside/Other`;

          yield* fs.mkdir(currentRoot, { recursive: true });

          const config = makeDefaultConfig(databaseFile);
          config.library.library_path = libraryRoot;

          yield* Effect.promise(() =>
            db.insert(appConfig).values({
              data: encodeConfigCore(config),
              id: 1,
              updatedAt: "2024-01-01T00:00:00.000Z",
            }),
          );

          yield* Effect.promise(() =>
            db.insert(anime).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              bannerImage: null,
              coverImage: null,
              description: null,
              endDate: null,
              endYear: null,
              episodeCount: 12,
              format: "TV",
              genres: "[]",
              id: 20,
              malId: null,
              monitored: true,
              nextAiringAt: null,
              nextAiringEpisode: null,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: currentRoot,
              score: null,
              startDate: null,
              startYear: null,
              status: "RELEASING",
              studios: "[]",
              titleEnglish: null,
              titleNative: null,
              titleRomaji: "Naruto",
            }),
          );

          const exit = yield* Effect.exit(
            updateAnimePathEffect({
              db,
              fs,
              id: 20,
              nowIso: () => Effect.succeed("2024-01-02T00:00:00.000Z"),
              path: requestedRoot,
            }),
          );

          assertEquals(exit._tag, "Failure");

          if (Exit.isFailure(exit)) {
            const failure = Cause.failureOption(exit.cause);
            assertEquals(failure._tag, "Some");

            if (failure._tag === "Some") {
              assertInstanceOf(failure.value, AnimePathError);
              assertEquals(failure.value instanceof AnimePathError, true);
              assertEquals(failure.value._tag, "AnimePathError");
            }
          }

          const requestedRootExit = yield* Effect.exit(fs.stat(requestedRoot));
          assertEquals(requestedRootExit._tag, "Failure");
        }),
      schema,
    }),
  ),
);
