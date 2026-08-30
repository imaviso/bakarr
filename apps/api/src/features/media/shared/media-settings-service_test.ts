import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Cause, Effect, Exit, Layer } from "effect";

import * as schema from "@/db/schema.ts";
import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaSettingsService } from "@/features/media/shared/media-settings-service.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { encodeConfigCore, toConfigCore } from "@/features/system/config-codec.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  makeMediaRepository,
  makeQualityProfileRepository,
  makeSystemConfigRepository,
  makeSystemLogRepository,
} from "@/test/repository-factories.ts";

function makeSettingsLayer(db: AppDatabase, sandboxFs: typeof FileSystem.Service) {
  return MediaSettingsService.DefaultWithoutDependencies.pipe(
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
        Layer.succeed(FileSystem, sandboxFs),
        Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db)),
        Layer.succeed(MediaRepository, makeMediaRepository(db)),
        Layer.succeed(QualityProfileRepository, makeQualityProfileRepository(db)),
        Layer.succeed(SystemConfigRepository, makeSystemConfigRepository(db)),
        Layer.succeed(SystemLogRepository, makeSystemLogRepository(db)),
      ),
    ),
  );
}

it.scoped("updatePath validates against the root matching the media kind", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ root, fs }) =>
        Effect.gen(function* () {
          const mangaRoot = `${root}/manga`;
          const animeRoot = `${root}/anime`;
          yield* fs.mkdir(mangaRoot, { recursive: true });
          yield* fs.mkdir(animeRoot, { recursive: true });

          const testConfig = makeTestConfig("./test.sqlite", (config) => ({
            ...config,
            downloads: {
              ...config.downloads,
              create_media_folders: false,
            },
            library: {
              ...config.library,
              anime_path: animeRoot,
              manga_path: mangaRoot,
              light_novel_path: `${root}/light-novels`,
            },
          }));
          const encodedConfig = yield* toConfigCore(testConfig).pipe(
            Effect.flatMap((core) => encodeConfigCore(core)),
          );
          yield* tryDatabasePromise("Failed to seed appConfig", () =>
            db.insert(schema.appConfig).values({
              id: 1,
              data: encodedConfig,
              updatedAt: "2024-01-01T00:00:00.000Z",
            }),
          );

          yield* tryDatabasePromise("Failed to seed manga media row", () =>
            db.insert(schema.media).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              format: "MANGA",
              genres: "[]",
              id: 7,
              mediaKind: "manga",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: mangaRoot,
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "Manga Title",
            }),
          );

          const service = yield* MediaSettingsService.pipe(
            Effect.provide(makeSettingsLayer(db, FileSystem.make(fs))),
          );

          // A path inside the manga root is accepted for a manga-kind media.
          yield* service.updatePath(7, `${mangaRoot}/Series`);

          const rows = yield* tryDatabasePromise("Failed to load updated media row", () =>
            db.select().from(schema.media).where(eq(schema.media.id, 7)),
          );
          assert.deepStrictEqual(rows[0]?.rootFolder, `${mangaRoot}/Series`);

          // A path inside the anime root must be rejected for a manga-kind media.
          const outsideExit = yield* Effect.exit(service.updatePath(7, `${animeRoot}/Show`));
          assert.deepStrictEqual(Exit.isFailure(outsideExit), true);
          if (Exit.isFailure(outsideExit)) {
            const failure = Cause.failureOption(outsideExit.cause);
            assert.deepStrictEqual(failure._tag, "Some");
            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value._tag, "DomainPathError");
            }
          }
        }),
      ),
    schema,
  }),
);
