import { assert, it } from "@effect/vitest";
import { dirname, join, resolve } from "node:path";
import type * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Effect, Layer, Stream } from "effect";

import * as schema from "@/db/schema.ts";
import { AppConfig } from "@/app/config/schema.ts";
import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { MediaMaintenanceService } from "@/features/media/metadata/media-maintenance-service.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { pdfCacheDirectory } from "@/features/media/reader/pdf-reader.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { BackgroundJobRepository } from "@/features/system/repository/background-job-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { exists, withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  makeBackgroundJobRepository,
  makeMediaRepository,
  makeMediaUnitRepository,
  makeSystemLogRepository,
} from "@/test/repository-factories.ts";

function makeMaintenanceLayer(
  db: AppDatabase,
  databaseFile: string,
  client: NodeSqliteClient.SqliteClient,
  sandboxFs: typeof FileSystem.Service,
  imagesPath: string,
) {
  return MediaMaintenanceService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          EventBus,
          EventBus.of({
            publish: () => Effect.void,
            publishInfo: () => Effect.void,
            withSubscriptionStream: () => Stream.die(new Error("not used in test")),
          }),
        ),
        Layer.succeed(AppConfig, {
          appVersion: "0.1.0",
          databaseFile,
          port: 8000,
          sessionCookieName: "bakarr_session",
          sessionCookieSecure: true,
          sessionDurationDays: 30,
          trustedHosts: [],
        }),
        Layer.succeed(
          RuntimeConfigSnapshotService,
          RuntimeConfigSnapshotService.of({
            getRuntimeConfig: () =>
              Effect.succeed(
                makeTestConfig(databaseFile, (config) => ({
                  ...config,
                  general: { ...config.general, images_path: imagesPath },
                })),
              ),
            replaceRuntimeConfig: () => Effect.void,
          }),
        ),
        Layer.succeed(
          MediaMetadataProviderService,
          MediaMetadataProviderService.of({
            getAnimeMetadataById: () => Effect.die(new Error("not used in test")),
            getSeasonalAnime: () => Effect.die(new Error("not used in test")),
            searchMedia: () => Effect.die(new Error("not used in test")),
          }),
        ),
        Layer.succeed(
          MediaImageCacheService,
          MediaImageCacheService.of({
            cacheMetadataImages: () => Effect.die(new Error("not used in test")),
          }),
        ),
        Layer.succeed(
          OperationsTaskLauncherService,
          OperationsTaskLauncherService.of({
            launch: () => Effect.die(new Error("not used in test")),
          }),
        ),
        Layer.succeed(FileSystem, sandboxFs),
        Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.of(db)),
        Layer.succeed(MediaRepository, makeMediaRepository(db, client)),
        Layer.succeed(MediaUnitRepository, makeMediaUnitRepository(db, client)),
        Layer.succeed(BackgroundJobRepository, makeBackgroundJobRepository(db, client)),
        Layer.succeed(SystemLogRepository, makeSystemLogRepository(db, client)),
      ),
    ),
  );
}

it.effect("deleteMedia prunes the image cache and reader render cache", () =>
  withSqliteTestDbEffect({
    schema,
    run: (db, databaseFile, client, _exec) =>
      withFileSystemSandboxEffect(({ root, fs }) =>
        Effect.gen(function* () {
          const imagesPath = `${root}/images`;
          const libraryRoot = `${root}/library`;
          const unitFilePath = `${libraryRoot}/Volume 1.pdf`;
          yield* fs.mkdir(`${imagesPath}/media/9`, { recursive: true });
          yield* fs.mkdir(libraryRoot, { recursive: true });
          yield* fs.writeFile(unitFilePath, new TextEncoder().encode("x"));
          yield* fs.writeFile(`${imagesPath}/media/9/cover.png`, new Uint8Array([1]));

          const readerCacheRoot = join(dirname(resolve(databaseFile)), "reader-cache");
          const pdfCacheDir = pdfCacheDirectory({
            cacheRoot: readerCacheRoot,
            filePath: unitFilePath,
            fileSize: 1,
          });
          yield* fs.mkdir(pdfCacheDir, { recursive: true });
          yield* fs.writeFile(`${pdfCacheDir}/page-1.jpg`, new Uint8Array([2]));

          yield* db
            .insert(schema.media)
            .values({
              addedAt: "2024-01-01T00:00:00Z",
              format: "MANGA",
              genres: "[]",
              id: 9,
              mediaKind: "manga",
              monitored: false,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: libraryRoot,
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "Deletable Manga",
            })
            .prepare()
            .effect();
          yield* db
            .insert(schema.mediaUnits)
            .values({
              downloaded: true,
              filePath: unitFilePath,
              fileSize: 1,
              mediaId: 9,
              number: 1,
            })
            .prepare()
            .effect();

          yield* Effect.gen(function* () {
            const service = yield* MediaMaintenanceService;
            yield* service.deleteMedia(9);
          }).pipe(
            Effect.provide(
              makeMaintenanceLayer(db, databaseFile, client, FileSystem.of(fs), imagesPath),
            ),
          );

          assert.deepStrictEqual(yield* exists(fs, `${imagesPath}/media/9`), false);
          assert.deepStrictEqual(yield* exists(fs, pdfCacheDir), false);

          const unitRows = yield* db.select().from(schema.mediaUnits).prepare().effect();
          assert.deepStrictEqual(unitRows.length, 0);
        }),
      ),
  }),
);
