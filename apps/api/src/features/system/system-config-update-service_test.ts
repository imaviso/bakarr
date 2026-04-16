import { Effect, Layer, Ref, Stream } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { AppConfig } from "@/config.ts";
import {
  BackgroundWorkerController,
  type BackgroundWorkerControllerShape,
} from "@/background-controller-core.ts";
import { Database, type AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { ClockServiceLive } from "@/lib/clock.ts";
import { RuntimeLogLevelStateLive } from "@/lib/logging.ts";
import { RandomServiceLive } from "@/lib/random.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { makeDatabaseServiceStub } from "@/test/stubs.ts";
import { assert, describe, it } from "@effect/vitest";
import { decodeStoredConfigRow } from "@/features/system/config-codec.ts";
import {
  SystemConfigUpdateService,
  SystemConfigUpdateServiceLive,
} from "@/features/system/system-config-update-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { loadSystemConfigRow } from "@/features/system/repository/system-config-repository.ts";
import { EventBus } from "@/features/events/event-bus.ts";

describe("SystemConfigUpdateService", () => {
  it.scoped("persists updated config and reloads background workers", () =>
    withSqliteTestDbEffect({
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const reloads: Config[] = [];
          const runtimeConfigRef = yield* Ref.make(makeTestConfig(databaseFile));
          const fullLayer = makeSystemConfigUpdateTestLayer({
            db,
            databaseFile,
            reloads,
            runtimeConfigRef,
          });

          const nextConfig = makeTestConfig(databaseFile, (config) => ({
            ...config,
            general: {
              ...config.general,
              images_path: "/images/custom",
            },
          }));

          yield* Effect.gen(function* () {
            const updateService = yield* SystemConfigUpdateService;

            const updated = yield* updateService.updateConfig(nextConfig);
            const currentConfig = yield* Ref.get(runtimeConfigRef);
            const storedRow = yield* loadSystemConfigRow(db);
            const storedCore = yield* decodeStoredConfigRow(storedRow);

            assert.deepStrictEqual(updated.general.images_path, "/images/custom");
            assert.deepStrictEqual(currentConfig.general.images_path, "/images/custom");
            assert.deepStrictEqual(storedCore.general.images_path, "/images/custom");
            assert.deepStrictEqual(updated.qbittorrent.password, nextConfig.qbittorrent.password);
            assert.deepStrictEqual(reloads.length, 1);
            assert.deepStrictEqual(reloads[0]?.general.images_path, "/images/custom");
          }).pipe(Effect.provide(fullLayer));
        }),
      schema,
    }),
  );

  it.scoped("preserves the stored qBittorrent password when the update omits it", () =>
    withSqliteTestDbEffect({
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const runtimeConfigRef = yield* Ref.make(makeTestConfig(databaseFile));
          const fullLayer = makeSystemConfigUpdateTestLayer({
            db,
            databaseFile,
            reloads: [],
            runtimeConfigRef,
          });

          const nextConfig = makeTestConfig(databaseFile, (config) => ({
            ...config,
            qbittorrent: {
              ...config.qbittorrent,
              enabled: true,
              password: "secret-pass",
            },
          }));

          yield* Effect.gen(function* () {
            const updateService = yield* SystemConfigUpdateService;

            yield* updateService.updateConfig(nextConfig);
            const updated = yield* updateService.updateConfig({
              ...nextConfig,
              qbittorrent: {
                ...nextConfig.qbittorrent,
                password: null,
              },
            });
            const currentConfig = yield* Ref.get(runtimeConfigRef);
            const storedRow = yield* loadSystemConfigRow(db);
            const storedCore = yield* decodeStoredConfigRow(storedRow);

            assert.deepStrictEqual(updated.qbittorrent.password, "secret-pass");
            assert.deepStrictEqual(currentConfig.qbittorrent.password, "secret-pass");
            assert.deepStrictEqual(storedCore.qbittorrent.password, "secret-pass");
          }).pipe(Effect.provide(fullLayer));
        }),
      schema,
    }),
  );

  it.scoped("preserves the stored AniDB password when the update omits it", () =>
    withSqliteTestDbEffect({
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const runtimeConfigRef = yield* Ref.make(makeTestConfig(databaseFile));
          const fullLayer = makeSystemConfigUpdateTestLayer({
            db,
            databaseFile,
            reloads: [],
            runtimeConfigRef,
          });

          const nextConfig = makeTestConfig(databaseFile, (config) => ({
            ...config,
            metadata: {
              ...config.metadata,
              anidb: {
                ...config.metadata!.anidb,
                enabled: true,
                password: "anidb-secret",
                username: "bakarruser",
              },
            },
          }));

          yield* Effect.gen(function* () {
            const updateService = yield* SystemConfigUpdateService;

            yield* updateService.updateConfig(nextConfig);
            const updated = yield* updateService.updateConfig({
              ...nextConfig,
              metadata: {
                ...nextConfig.metadata,
                anidb: {
                  ...nextConfig.metadata!.anidb,
                  password: null,
                },
              },
            });
            const currentConfig = yield* Ref.get(runtimeConfigRef);
            const storedRow = yield* loadSystemConfigRow(db);
            const storedCore = yield* decodeStoredConfigRow(storedRow);

            assert.deepStrictEqual(updated.metadata?.anidb.password, "anidb-secret");
            assert.deepStrictEqual(currentConfig.metadata?.anidb.password, "anidb-secret");
            assert.deepStrictEqual(storedCore.metadata?.anidb.password, "anidb-secret");
          }).pipe(Effect.provide(fullLayer));
        }),
      schema,
    }),
  );
});

function makeBackgroundWorkerControllerStub(reloads: Config[]): BackgroundWorkerControllerShape {
  return {
    isStarted: () => Effect.succeed(false),
    reload: (config) =>
      Effect.sync(() => {
        reloads.push(config);
      }),
    start: () => Effect.void,
    stop: () => Effect.void,
  };
}

function makeSystemConfigUpdateTestLayer(input: {
  readonly db: AppDatabase;
  readonly databaseFile: string;
  readonly reloads: Config[];
  readonly runtimeConfigRef: Ref.Ref<Config>;
}) {
  const baseLayer = Layer.mergeAll(
    AppConfig.layer({ databaseFile: input.databaseFile }).pipe(Layer.provide(RandomServiceLive)),
    ClockServiceLive,
    RuntimeLogLevelStateLive,
    Layer.succeed(Database, makeDatabaseServiceStub(input.db)),
    Layer.succeed(BackgroundWorkerController, makeBackgroundWorkerControllerStub(input.reloads)),
    Layer.succeed(RuntimeConfigSnapshotService, {
      getRuntimeConfig: () => Ref.get(input.runtimeConfigRef),
      replaceRuntimeConfig: (config) => Ref.set(input.runtimeConfigRef, config),
    }),
    Layer.succeed(EventBus, {
      publish: () => Effect.void,
      publishInfo: () => Effect.void,
      withSubscriptionStream: (use) =>
        use({
          stream: Stream.empty,
          takeBufferedOnce: Effect.succeed([]),
        }),
    }),
  );

  return SystemConfigUpdateServiceLive.pipe(Layer.provide(baseLayer));
}
