import { assertEquals, it } from "../../test/vitest.ts";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import * as schema from "../../db/schema.ts";
import { withSqliteTestDbEffect } from "../../test/database-test.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "../../test/filesystem-test.ts";
import { resolveEpisodeFileEffect } from "./file-mapping-support.ts";

const insertAnime = Effect.fn("Test.insertAnime")(function* (db: AppDatabase, rootFolder: string) {
  yield* Effect.tryPromise(() =>
    db.insert(schema.anime).values({
      addedAt: "2024-01-01T00:00:00Z",
      format: "TV",
      genres: "[]",
      id: 1,
      monitored: true,
      profileName: "Default",
      releaseProfileIds: "[]",
      rootFolder,
      status: "RELEASING",
      studios: "[]",
      titleRomaji: "Test Show",
    }),
  );
});

it.scoped("resolveEpisodeFileEffect returns resolved file when mapping is valid", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          const filePath = `${root}/Episode 1.mkv`;
          yield* writeTextFile(fs, filePath, "video");
          yield* insertAnime(appDb, root);
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.episodes).values({
              animeId: 1,
              downloaded: true,
              filePath,
              number: 1,
            }),
          );

          const result = yield* resolveEpisodeFileEffect({
            animeId: 1,
            db: appDb,
            episodeNumber: 1,
            fs,
          });

          assertEquals(result._tag, "EpisodeFileResolved");
          if (result._tag === "EpisodeFileResolved") {
            assertEquals(result.fileName, "Episode 1.mkv");
            assertEquals(result.filePath, filePath);
          }
        }),
      ),
    schema,
  }),
);

it.scoped("resolveEpisodeFileEffect returns unmapped state when no file path is stored", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          yield* insertAnime(appDb, root);
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.episodes).values({
              animeId: 1,
              downloaded: false,
              filePath: null,
              number: 1,
            }),
          );

          const result = yield* resolveEpisodeFileEffect({
            animeId: 1,
            db: appDb,
            episodeNumber: 1,
            fs,
          });

          assertEquals(result._tag, "EpisodeFileUnmapped");
        }),
      ),
    schema,
  }),
);

it.scoped("resolveEpisodeFileEffect returns missing state when mapped file is inaccessible", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          const filePath = `${root}/Missing Episode.mkv`;
          yield* insertAnime(appDb, root);
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.episodes).values({
              animeId: 1,
              downloaded: true,
              filePath,
              number: 1,
            }),
          );

          const result = yield* resolveEpisodeFileEffect({
            animeId: 1,
            db: appDb,
            episodeNumber: 1,
            fs,
          });

          assertEquals(result._tag, "EpisodeFileMissing");
        }),
      ),
    schema,
  }),
);

it.scoped(
  "resolveEpisodeFileEffect returns root inaccessible state when anime root is inaccessible",
  () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db) =>
        withFileSystemSandboxEffect(({ fs, root }) =>
          Effect.gen(function* () {
            const appDb = db as AppDatabase;
            const filePath = `${root}/Episode 1.mkv`;
            yield* writeTextFile(fs, filePath, "video");
            yield* insertAnime(appDb, `${root}/missing-root`);
            yield* Effect.tryPromise(() =>
              appDb.insert(schema.episodes).values({
                animeId: 1,
                downloaded: true,
                filePath,
                number: 1,
              }),
            );

            const result = yield* resolveEpisodeFileEffect({
              animeId: 1,
              db: appDb,
              episodeNumber: 1,
              fs,
            });

            assertEquals(result._tag, "EpisodeFileRootInaccessible");
          }),
        ),
      schema,
    }),
);

it.scoped(
  "resolveEpisodeFileEffect returns outside-root state when mapping escapes anime root",
  () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db) =>
        withFileSystemSandboxEffect(({ fs, root }) =>
          Effect.gen(function* () {
            const appDb = db as AppDatabase;
            const animeRoot = `${root}/anime`;
            const externalRoot = `${root}/external`;
            const filePath = `${externalRoot}/Episode 1.mkv`;

            yield* fs.mkdir(animeRoot, { recursive: true });
            yield* fs.mkdir(externalRoot, { recursive: true });
            yield* writeTextFile(fs, filePath, "video");

            yield* insertAnime(appDb, animeRoot);
            yield* Effect.tryPromise(() =>
              appDb.insert(schema.episodes).values({
                animeId: 1,
                downloaded: true,
                filePath,
                number: 1,
              }),
            );

            const result = yield* resolveEpisodeFileEffect({
              animeId: 1,
              db: appDb,
              episodeNumber: 1,
              fs,
            });

            assertEquals(result._tag, "EpisodeFileOutsideRoot");
          }),
        ),
      schema,
    }),
);
