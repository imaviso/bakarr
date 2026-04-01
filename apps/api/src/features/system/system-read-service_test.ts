import { CommandExecutor } from "@effect/platform";
import { Cause, Effect, Exit, Layer } from "effect";

import { AppConfig } from "@/config.ts";
import { Database, type DatabaseService } from "@/db/database.ts";
import { AppRuntime } from "@/app-runtime.ts";
import { BackgroundWorkerMonitorLive } from "@/background-monitor.ts";
import { ClockServiceLive } from "@/lib/clock.ts";
import { RandomServiceLive } from "@/lib/random.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { assertEquals, describe, it } from "@/test/vitest.ts";
import * as schema from "@/db/schema.ts";
import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemReadService, SystemReadServiceLive } from "@/features/system/system-read-service.ts";

describe("SystemReadService", () => {
  it.scoped("fails when the stored config row is missing", () =>
    withSqliteTestDbEffect({
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const commandExecutor = makeCommandExecutorStub((command) => {
            if (command.command !== "df") {
              return Effect.die(new Error(`unexpected command: ${command.command}`));
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
            Layer.succeed(Database, {
              client: {} as DatabaseService["client"],
              db,
            }),
          );

          const diskSpaceLayer = DiskSpaceInspectorLive.pipe(Layer.provide(baseLayer));
          const systemConfigLayer = SystemConfigServiceLive.pipe(Layer.provide(baseLayer));
          const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
            Layer.provide(Layer.mergeAll(baseLayer, systemConfigLayer)),
          );
          const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
            Layer.provide(Layer.mergeAll(baseLayer, systemConfigLayer, runtimeConfigSnapshotLayer)),
          );
          const systemReadLayer = SystemReadServiceLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                baseLayer,
                diskSpaceLayer,
                systemConfigLayer,
                runtimeConfigSnapshotLayer,
                backgroundJobStatusLayer,
              ),
            ),
          );

          const exit = yield* Effect.exit(
            Effect.flatMap(SystemReadService, (service) => service.getSystemStatus()).pipe(
              Effect.provide(systemReadLayer),
            ),
          );

          assertEquals(Exit.isFailure(exit), true);

          if (Exit.isFailure(exit)) {
            const failure = Cause.failureOption(exit.cause);
            assertEquals(failure._tag, "Some", Cause.pretty(exit.cause));

            if (failure._tag === "Some") {
              assertEquals(failure.value._tag, "StoredConfigMissingError");
            }
          }
        }),
      schema,
    }),
  );
});

function makeCommandExecutorStub(
  runAsString: (command: {
    readonly args: ReadonlyArray<string>;
    readonly command: string;
  }) => Effect.Effect<string, never>,
): CommandExecutor.CommandExecutor {
  return {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    exitCode: () => Effect.die("exitCode not implemented for test"),
    lines: (command, _encoding) =>
      runAsString(command as { args: ReadonlyArray<string>; command: string }).pipe(
        Effect.map((value) => value.split(/\r?\n/).filter((line) => line.length > 0)),
      ),
    start: () => Effect.die("start not implemented for test"),
    stream: () => Effect.die("stream not implemented for test"),
    streamLines: () => Effect.die("streamLines not implemented for test"),
    string: (command, _encoding) =>
      runAsString(command as { args: ReadonlyArray<string>; command: string }),
  };
}
