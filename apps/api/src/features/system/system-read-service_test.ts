import { CommandExecutor } from "@effect/platform";
import { Cause, Effect, Exit, Layer } from "effect";

import { AppConfig } from "@/config.ts";
import { Database } from "@/db/database.ts";
import { AppRuntime } from "@/app-runtime.ts";
import { BackgroundWorkerMonitorLive } from "@/background-monitor.ts";
import { ClockServiceLive } from "@/lib/clock.ts";
import { RandomServiceLive } from "@/lib/random.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { commandName, makeCommandExecutorStub, makeDatabaseServiceStub } from "@/test/stubs.ts";
import { assert, describe, it } from "@effect/vitest";
import * as schema from "@/db/schema.ts";
import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemActivityReadServiceLive } from "@/features/system/system-activity-read-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemDashboardReadServiceLive } from "@/features/system/system-dashboard-read-service.ts";
import { SystemLibraryStatsReadServiceLive } from "@/features/system/system-library-stats-read-service.ts";
import { SystemReadService, SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";
import { SystemStatusReadServiceLive } from "@/features/system/system-status-read-service.ts";

describe("SystemReadService", () => {
  it.scoped("fails when the stored config row is missing", () =>
    withSqliteTestDbEffect({
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const commandExecutor = makeCommandExecutorStub((command) => {
            const name = commandName(command);

            if (name !== "df") {
              return Effect.die(new Error(`unexpected command: ${name ?? "unknown"}`));
            }

            return Effect.succeed(
              "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 1000 250 750 25% /library",
            );
          });

          const configLayer = AppConfig.layer({ databaseFile }).pipe(
            Layer.provide(RandomServiceLive),
          );

          const baseLayer = Layer.mergeAll(
            configLayer,
            AppRuntime.layer().pipe(Layer.provide(ClockServiceLive)),
            BackgroundWorkerMonitorLive.pipe(Layer.provide(ClockServiceLive)),
            ClockServiceLive,
            Layer.succeed(CommandExecutor.CommandExecutor, commandExecutor),
            Layer.succeed(Database, makeDatabaseServiceStub(db)),
          );

          const diskSpaceLayer = DiskSpaceInspectorLive.pipe(Layer.provide(baseLayer));
          const systemConfigLayer = SystemConfigServiceLive.pipe(Layer.provide(baseLayer));
          const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
            Layer.provide(Layer.mergeAll(baseLayer, systemConfigLayer)),
          );
          const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
            Layer.provide(Layer.mergeAll(baseLayer, systemConfigLayer, runtimeConfigSnapshotLayer)),
          );
          const systemStatusReadLayer = SystemStatusReadServiceLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                baseLayer,
                diskSpaceLayer,
                runtimeConfigSnapshotLayer,
                backgroundJobStatusLayer,
              ),
            ),
          );
          const systemLibraryStatsReadLayer = SystemLibraryStatsReadServiceLive.pipe(
            Layer.provide(baseLayer),
          );
          const systemActivityReadLayer = SystemActivityReadServiceLive.pipe(
            Layer.provide(baseLayer),
          );
          const systemDashboardReadLayer = SystemDashboardReadServiceLive.pipe(
            Layer.provide(Layer.mergeAll(baseLayer, backgroundJobStatusLayer)),
          );
          const systemRuntimeMetricsLayer = SystemRuntimeMetricsServiceLive.pipe(
            Layer.provide(Layer.mergeAll(systemStatusReadLayer, systemLibraryStatsReadLayer)),
          );
          const systemReadLayer = SystemReadServiceLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                baseLayer,
                backgroundJobStatusLayer,
                systemStatusReadLayer,
                systemLibraryStatsReadLayer,
                systemActivityReadLayer,
                systemDashboardReadLayer,
                systemRuntimeMetricsLayer,
              ),
            ),
          );

          const exit = yield* Effect.exit(
            Effect.flatMap(SystemReadService, (service) => service.getSystemStatus()).pipe(
              Effect.provide(systemReadLayer),
            ),
          );

          assert.deepStrictEqual(Exit.isFailure(exit), true);

          if (Exit.isFailure(exit)) {
            const failure = Cause.failureOption(exit.cause);
            assert.deepStrictEqual(failure._tag, "Some", Cause.pretty(exit.cause));

            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value._tag, "StoredConfigMissingError");
            }
          }
        }),
      schema,
    }),
  );
});
