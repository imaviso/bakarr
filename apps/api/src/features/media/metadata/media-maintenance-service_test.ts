import { assert, it } from "@effect/vitest";
import { dirname, join, resolve } from "node:path";
import { Effect, Layer } from "effect";

import * as schema from "@/db/schema.ts";
import { AppConfig } from "@/config/schema.ts";
import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
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
  sandboxFs: typeof FileSystem.Service,
  imagesPath: string,
) {
  return MediaMaintenanceService.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          EventBus,
          EventBus.make({
            publish: () => Effect.void,
            publishInfo: () => Effect.void,
            withSubscriptionStream: () => Effect.dieMessage("not used in test"),
          }),
        ),
        Layer.succeed(AppConfig, {
          appVersion: "0.1.0",
          databaseFile,
          port: 8000,
          sessionCookieName: "bakarr_session",
          sessionCookieSecure: true,
          sessionDurationDays: 30,
        }),
        Layer.succeed(
          RuntimeConfigSnapshotService,
          RuntimeConfigSnapshotService.make({
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
          MediaMetadataProviderService.make({
            getAnimeMetadataById: () => Effect.dieMessage("not used in test"),
            getSeasonalAnime: () => Effect.dieMessage("not used in test"),
            searchMedia: () => Effect.dieMessage("not used in test"),
          }),
        ),
        Layer.succeed(
          MediaImageCacheService,
          MediaImageCacheService.make({
            cacheMetadataImages: () => Effect.dieMessage("not used in test"),
          }),
        ),
        Layer.succeed(
          OperationsTaskLauncherService,
          OperationsTaskLauncherService.make({
            launch: () => Effect.dieMessage("not used in test"),
          }),
        ),
        Layer.succeed(FileSystem, sandboxFs),
        Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
        Layer.succeed(MediaRepository, makeMediaRepository(db)),
        Layer.succeed(MediaUnitRepository, makeMediaUnitRepository(db)),
        Layer.succeed(BackgroundJobRepository, makeBackgroundJobRepository(db)),
        Layer.succeed(SystemLogRepository, makeSystemLogRepository(db)),
      ),
    ),
  );
}

it.scoped("deleteMedia prunes the image cache and reader render cache", () =>
  withSqliteTestDbEffect({
    schema,
    run: (db, databaseFile) =>
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

          yield* Effect.tryPromise(() =>
            db.insert(schema.media).values({
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
            }),
          );
          yield* Effect.tryPromise(() =>
            db.insert(schema.mediaUnits).values({
              downloaded: true,
              filePath: unitFilePath,
              fileSize: 1,
              mediaId: 9,
              number: 1,
            }),
          );

          yield* Effect.gen(function* () {
            const service = yield* MediaMaintenanceService;
            yield* service.deleteMedia(9);
          }).pipe(
            Effect.provide(makeMaintenanceLayer(db, databaseFile, FileSystem.make(fs), imagesPath)),
          );

          assert.deepStrictEqual(yield* exists(fs, `${imagesPath}/media/9`), false);
          assert.deepStrictEqual(yield* exists(fs, pdfCacheDir), false);

          const unitRows = yield* Effect.tryPromise(() => db.select().from(schema.mediaUnits));
          assert.deepStrictEqual(unitRows.length, 0);
        }),
      ),
  }),
);
