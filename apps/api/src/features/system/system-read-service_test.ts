import { Cause, Effect, Exit, Layer } from "effect";

import { assert, describe, it } from "@effect/vitest";
import { BackgroundJobStatusService } from "@/features/system/background-job-status-service.ts";
import { StoredConfigMissingError } from "@/features/system/errors.ts";
import { SystemActivityReadService } from "@/features/system/system-activity-read-service.ts";
import { SystemDashboardReadService } from "@/features/system/system-dashboard-read-service.ts";
import { SystemLibraryStatsReadService } from "@/features/system/system-library-stats-read-service.ts";
import { SystemReadService, SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsService } from "@/features/system/system-runtime-metrics-service.ts";
import { SystemStatusReadService } from "@/features/system/system-status-read-service.ts";

describe("SystemReadService", () => {
  it.effect("fails when the underlying system status read reports missing config", () =>
    Effect.gen(function* () {
      const missing = new StoredConfigMissingError({ message: "Stored configuration is missing" });
      const systemReadLayer = SystemReadServiceLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(SystemStatusReadService, {
              getSystemStatus: () => Effect.fail(missing),
            }),
            Layer.succeed(SystemLibraryStatsReadService, {
              getLibraryStats: () => Effect.die("unused"),
            }),
            Layer.succeed(SystemActivityReadService, {
              getActivity: () => Effect.die("unused"),
            }),
            Layer.succeed(SystemDashboardReadService, {
              getDashboard: () => Effect.die("unused"),
            }),
            Layer.succeed(SystemRuntimeMetricsService, {
              getRuntimeMetricsSummary: () => Effect.die("unused"),
              renderPrometheusMetrics: () => Effect.die("unused"),
            }),
            Layer.succeed(BackgroundJobStatusService, {
              getSnapshot: () => Effect.die("unused"),
            }),
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
  );
});
