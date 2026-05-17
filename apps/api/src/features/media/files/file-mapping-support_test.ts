import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { resolveUnitFileEffect } from "@/features/media/files/media-file-read.ts";

const insertAnime = Effect.fn("Test.insertAnime")(function* (db: AppDatabase, rootFolder: string) {
  yield* Effect.tryPromise(() =>
    db.insert(schema.media).values({
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

it.scoped("resolveUnitFileEffect returns resolved file when mapping is valid", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const filePath = `${root}/MediaUnit 1.mkv`;
          yield* writeTextFile(fs, filePath, "video");
          yield* insertAnime(appDb, root);
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values({
              mediaId: 1,
              downloaded: true,
              filePath,
              number: 1,
            }),
          );

          const result = yield* resolveUnitFileEffect({
            mediaId: 1,
            db: appDb,
            unitNumber: 1,
            fs,
          });

          assert.deepStrictEqual(result._tag, "EpisodeFileResolved");
          if (result._tag === "EpisodeFileResolved") {
            assert.deepStrictEqual(result.fileName, "MediaUnit 1.mkv");
            assert.deepStrictEqual(result.filePath, filePath);
          }
        }),
      ),
    schema,
  }),
);

it.scoped("resolveUnitFileEffect returns unmapped state when no file path is stored", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          yield* insertAnime(appDb, root);
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values({
              mediaId: 1,
              downloaded: false,
              filePath: null,
              number: 1,
            }),
          );

          const result = yield* resolveUnitFileEffect({
            mediaId: 1,
            db: appDb,
            unitNumber: 1,
            fs,
          });

          assert.deepStrictEqual(result._tag, "EpisodeFileUnmapped");
        }),
      ),
    schema,
  }),
);

it.scoped("resolveUnitFileEffect returns missing state when mapped file is inaccessible", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const filePath = `${root}/Missing MediaUnit.mkv`;
          yield* insertAnime(appDb, root);
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values({
              mediaId: 1,
              downloaded: true,
              filePath,
              number: 1,
            }),
          );

          const result = yield* resolveUnitFileEffect({
            mediaId: 1,
            db: appDb,
            unitNumber: 1,
            fs,
          });

          assert.deepStrictEqual(result._tag, "EpisodeFileMissing");
        }),
      ),
    schema,
  }),
);

it.scoped(
  "resolveUnitFileEffect returns root inaccessible state when media root is inaccessible",
  () =>
    withSqliteTestDbEffect({
      run: (db) =>
        withFileSystemSandboxEffect(({ fs, root }) =>
          Effect.gen(function* () {
            const appDb: AppDatabase = db;
            const filePath = `${root}/MediaUnit 1.mkv`;
            yield* writeTextFile(fs, filePath, "video");
            yield* insertAnime(appDb, `${root}/missing-root`);
            yield* Effect.tryPromise(() =>
              appDb.insert(schema.mediaUnits).values({
                mediaId: 1,
                downloaded: true,
                filePath,
                number: 1,
              }),
            );

            const result = yield* resolveUnitFileEffect({
              mediaId: 1,
              db: appDb,
              unitNumber: 1,
              fs,
            });

            assert.deepStrictEqual(result._tag, "EpisodeFileRootInaccessible");
          }),
        ),
      schema,
    }),
);

it.scoped("resolveUnitFileEffect returns outside-root state when mapping escapes media root", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const animeRoot = `${root}/media`;
          const externalRoot = `${root}/external`;
          const filePath = `${externalRoot}/MediaUnit 1.mkv`;

          yield* fs.mkdir(animeRoot, { recursive: true });
          yield* fs.mkdir(externalRoot, { recursive: true });
          yield* writeTextFile(fs, filePath, "video");

          yield* insertAnime(appDb, animeRoot);
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values({
              mediaId: 1,
              downloaded: true,
              filePath,
              number: 1,
            }),
          );

          const result = yield* resolveUnitFileEffect({
            mediaId: 1,
            db: appDb,
            unitNumber: 1,
            fs,
          });

          assert.deepStrictEqual(result._tag, "EpisodeFileOutsideRoot");
        }),
      ),
    schema,
  }),
);
