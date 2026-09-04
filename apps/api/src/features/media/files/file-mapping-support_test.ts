import { assert, it } from "@effect/vitest";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { resolveUnitFileEffect } from "@/features/media/files/media-file-read.ts";
import { makeMediaRepository } from "@/test/repository-factories.ts";
import { type DbExecutor } from "@/infra/effect/db.ts";
import { Effect } from "effect";

const insertAnime = Effect.fn("Test.insertAnime")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  rootFolder: string,
) {
  yield* exec.runQuery(
    "Failed to seed media for file mapping test",
    db
      .insert(schema.media)
      .values({
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
      })
      .prepare()
      .effect(),
  );
});

it.effect("resolveUnitFileEffect returns resolved file when mapping is valid", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const filePath = `${root}/MediaUnit 1.mkv`;
          yield* writeTextFile(fs, filePath, "video");
          yield* insertAnime(appDb, exec, root);
          yield* exec.runQuery(
            "Failed to seed mediaUnits for file mapping test",
            appDb
              .insert(schema.mediaUnits)
              .values({
                mediaId: 1,
                downloaded: true,
                filePath,
                number: 1,
              })
              .prepare()
              .effect(),
          );

          const result = yield* resolveUnitFileEffect({
            mediaId: 1,
            mediaRepository: makeMediaRepository(appDb, client),
            unitNumber: 1,
            fs,
          });

          assert.deepStrictEqual(result._tag, "UnitFileResolved");
          if (result._tag === "UnitFileResolved") {
            assert.deepStrictEqual(result.fileName, "MediaUnit 1.mkv");
            assert.deepStrictEqual(result.filePath, filePath);
          }
        }),
      ),
    schema,
  }),
);

it.effect("resolveUnitFileEffect returns unmapped state when no file path is stored", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          yield* insertAnime(appDb, exec, root);
          yield* exec.runQuery(
            "Failed to seed mediaUnits for file mapping test",
            appDb
              .insert(schema.mediaUnits)
              .values({
                mediaId: 1,
                downloaded: false,
                filePath: null,
                number: 1,
              })
              .prepare()
              .effect(),
          );

          const result = yield* Effect.result(
            resolveUnitFileEffect({
              mediaId: 1,
              mediaRepository: makeMediaRepository(appDb, client),
              unitNumber: 1,
              fs,
            }),
          );

          assert.deepStrictEqual(result._tag, "Failure");
          if (result._tag === "Failure" && result.failure._tag === "UnitFileResolveError") {
            assert.deepStrictEqual(result.failure.reason, "unmapped");
          }
        }),
      ),
    schema,
  }),
);

it.effect("resolveUnitFileEffect returns missing state when mapped file is inaccessible", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const filePath = `${root}/Missing MediaUnit.mkv`;
          yield* insertAnime(appDb, exec, root);
          yield* exec.runQuery(
            "Failed to seed mediaUnits for file mapping test",
            appDb
              .insert(schema.mediaUnits)
              .values({
                mediaId: 1,
                downloaded: true,
                filePath,
                number: 1,
              })
              .prepare()
              .effect(),
          );

          const result = yield* Effect.result(
            resolveUnitFileEffect({
              mediaId: 1,
              mediaRepository: makeMediaRepository(appDb, client),
              unitNumber: 1,
              fs,
            }),
          );

          assert.deepStrictEqual(result._tag, "Failure");
          if (result._tag === "Failure" && result.failure._tag === "UnitFileResolveError") {
            assert.deepStrictEqual(result.failure.reason, "missing");
          }
        }),
      ),
    schema,
  }),
);

it.effect(
  "resolveUnitFileEffect returns root inaccessible state when media root is inaccessible",
  () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client, exec) =>
        withFileSystemSandboxEffect(({ fs, root }) =>
          Effect.gen(function* () {
            const appDb: AppDatabase = db;
            const filePath = `${root}/MediaUnit 1.mkv`;
            yield* writeTextFile(fs, filePath, "video");
            yield* insertAnime(appDb, exec, `${root}/missing-root`);
            yield* appDb
              .insert(schema.mediaUnits)
              .values({
                mediaId: 1,
                downloaded: true,
                filePath,
                number: 1,
              })
              .prepare()
              .effect();

            const result = yield* Effect.result(
              resolveUnitFileEffect({
                mediaId: 1,
                mediaRepository: makeMediaRepository(appDb, client),
                unitNumber: 1,
                fs,
              }),
            );

            assert.deepStrictEqual(result._tag, "Failure");
            if (result._tag === "Failure" && result.failure._tag === "UnitFileResolveError") {
              assert.deepStrictEqual(result.failure.reason, "root-inaccessible");
            }
          }),
        ),
      schema,
    }),
);

it.effect("resolveUnitFileEffect returns outside-root state when mapping escapes media root", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, exec) =>
      withFileSystemSandboxEffect(({ fs, root }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const animeRoot = `${root}/media`;
          const externalRoot = `${root}/external`;
          const filePath = `${externalRoot}/MediaUnit 1.mkv`;

          yield* fs.mkdir(animeRoot, { recursive: true });
          yield* fs.mkdir(externalRoot, { recursive: true });
          yield* writeTextFile(fs, filePath, "video");

          yield* insertAnime(appDb, exec, animeRoot);
          yield* exec.runQuery(
            "Failed to seed mediaUnits for file mapping test",
            appDb
              .insert(schema.mediaUnits)
              .values({
                mediaId: 1,
                downloaded: true,
                filePath,
                number: 1,
              })
              .prepare()
              .effect(),
          );

          const result = yield* Effect.result(
            resolveUnitFileEffect({
              mediaId: 1,
              mediaRepository: makeMediaRepository(appDb, client),
              unitNumber: 1,
              fs,
            }),
          );

          assert.deepStrictEqual(result._tag, "Failure");
          if (result._tag === "Failure" && result.failure._tag === "UnitFileResolveError") {
            assert.deepStrictEqual(result.failure.reason, "outside-root");
          }
        }),
      ),
    schema,
  }),
);
