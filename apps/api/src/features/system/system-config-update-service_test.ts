import { Effect, Layer } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { AppConfig } from "../../config.ts";
import {
  BackgroundWorkerController,
  type BackgroundWorkerControllerShape,
} from "../../background-controller.ts";
import { Database, type DatabaseService } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import * as schema from "../../db/schema.ts";
import { ClockServiceLive } from "../../lib/clock.ts";
import { RandomServiceLive } from "../../lib/random.ts";
import { makeTestConfig } from "../../test/config-fixture.ts";
import { withSqliteTestDbEffect } from "../../test/database-test.ts";
import { assertEquals, describe, it } from "../../test/vitest.ts";
import { SystemConfigService, SystemConfigServiceLive } from "./system-config-service.ts";
import {
  SystemConfigUpdateService,
  SystemConfigUpdateServiceLive,
} from "./system-config-update-service.ts";

describe("SystemConfigUpdateService", () => {
  it.scoped("persists updated config and reloads background workers", () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const reloads: Config[] = [];
          const baseLayer = Layer.mergeAll(
            AppConfig.layer({ databaseFile }).pipe(Layer.provide(RandomServiceLive)),
            ClockServiceLive,
            Layer.succeed(Database, {
              client: {} as DatabaseService["client"],
              db,
            }),
            Layer.succeed(BackgroundWorkerController, makeBackgroundWorkerControllerStub(reloads)),
          );
          const serviceLayer = Layer.mergeAll(
            SystemConfigServiceLive,
            SystemConfigUpdateServiceLive,
          ).pipe(Layer.provide(baseLayer));

          const nextConfig = makeTestConfig(databaseFile, (config) => ({
            ...config,
            general: {
              ...config.general,
              images_path: "/images/custom",
            },
          }));

          yield* Effect.gen(function* () {
            const updateService = yield* SystemConfigUpdateService;
            const configService = yield* SystemConfigService;

            const updated = yield* updateService.updateConfig(nextConfig);
            const current = yield* configService.getConfig();

            assertEquals(updated.general.images_path, "/images/custom");
            assertEquals(current.general.images_path, "/images/custom");
            assertEquals(reloads.length, 1);
            assertEquals(reloads[0]?.general.images_path, "/images/custom");
          }).pipe(Effect.provide(serviceLayer));
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
