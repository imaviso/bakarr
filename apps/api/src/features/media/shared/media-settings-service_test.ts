import type * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Cause, Effect, Exit, Layer, Stream } from "effect";

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
import { tryDatabaseQuery } from "@/infra/effect/db.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  makeMediaRepository,
  makeQualityProfileRepository,
  makeSystemConfigRepository,
  makeSystemLogRepository,
} from "@/test/repository-factories.ts";

function makeSettingsLayer(
  db: AppDatabase,
  client: NodeSqliteClient.SqliteClient,
  sandboxFs: typeof FileSystem.Service,
) {
  return MediaSettingsService.layer.pipe(
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
        Layer.succeed(FileSystem, sandboxFs),
        Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.of(db)),
        Layer.succeed(MediaRepository, makeMediaRepository(db, client)),
        Layer.succeed(QualityProfileRepository, makeQualityProfileRepository(db, client)),
        Layer.succeed(SystemConfigRepository, makeSystemConfigRepository(db, client)),
        Layer.succeed(SystemLogRepository, makeSystemLogRepository(db, client)),
      ),
    ),
  );
}

it.effect("updatePath validates against the root matching the media kind", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
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
          yield* tryDatabaseQuery(
            "Failed to seed appConfig",
            db
              .insert(schema.appConfig)
              .values({
                id: 1,
                data: encodedConfig,
                updatedAt: "2024-01-01T00:00:00.000Z",
              })
              .prepare()
              .effect(),
          );

          yield* tryDatabaseQuery(
            "Failed to seed manga media row",
            db
              .insert(schema.media)
              .values({
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
              })
              .prepare()
              .effect(),
          );

          const service = yield* MediaSettingsService.pipe(
            Effect.provide(makeSettingsLayer(db, client, FileSystem.of(fs))),
          );

          // A path inside the manga root is accepted for a manga-kind media.
          yield* service.updatePath(7, `${mangaRoot}/Series`);

          const rows = yield* tryDatabaseQuery(
            "Failed to load updated media row",
            db.select().from(schema.media).where(eq(schema.media.id, 7)).prepare().effect(),
          );
          assert.deepStrictEqual(rows[0]?.rootFolder, `${mangaRoot}/Series`);

          // A path inside the anime root must be rejected for a manga-kind media.
          const outsideExit = yield* Effect.exit(service.updatePath(7, `${animeRoot}/Show`));
          assert.deepStrictEqual(Exit.isFailure(outsideExit), true);
          if (Exit.isFailure(outsideExit)) {
            const failure = Cause.findErrorOption(outsideExit.cause);
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
