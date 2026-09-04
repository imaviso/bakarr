import * as HttpServer from "effect/unstable/http/HttpServer";

import { BackgroundWorkerController } from "@/background/controller-core.ts";
import { initializeBackgroundWorkerMetrics } from "@/background/monitor.ts";
import { AppConfig, type AppConfigShape } from "@/app/config/schema.ts";
import { migrateDatabase } from "@/db/migrate.ts";
import { AuthBootstrapService } from "@/features/auth/bootstrap-service.ts";
import { BackgroundJobRepository } from "@/features/system/repository/background-job-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemBootstrapService } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigService } from "@/features/system/system-config-service.ts";
import { makeDefaultConfig, DEFAULT_PROFILES } from "@/features/system/defaults.ts";
import { composeConfig } from "@/features/system/config-codec.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/infra/logging.ts";
import { DateTime, Effect } from "effect";

export const bootstrapProgram = Effect.fn("api.bootstrap")(function* () {
  yield* migrateDatabase();

  const systemBootstrap = yield* SystemBootstrapService;
  yield* systemBootstrap.ensureInitialized();

  yield* (yield* BackgroundJobRepository).clearStaleRunningJobs();
  yield* pruneOldSystemLogs();

  const auth = yield* AuthBootstrapService;
  yield* auth.ensureBootstrapUser();

  return yield* AppConfig;
});

const SYSTEM_LOG_RETENTION_DAYS = 30;

/**
 * Retention sweep so `system_logs` cannot grow without bound on long-running
 * deployments. Runs once per process start; the table only accumulates within
 * a single uptime window.
 */
const pruneOldSystemLogs = Effect.fn("api.bootstrap.pruneSystemLogs")(function* () {
  const systemLogRepository = yield* SystemLogRepository;
  const now = yield* DateTime.nowAsDate;
  const cutoffIso = new Date(
    now.getTime() - SYSTEM_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const pruned = yield* systemLogRepository
    .deleteLogsOlderThan(cutoffIso)
    .pipe(
      Effect.catch((cause) =>
        Effect.logWarning("Failed to prune old system logs").pipe(
          Effect.annotateLogs({ cause: globalThis.String(cause) }),
          Effect.as(0),
        ),
      ),
    );

  if (pruned > 0) {
    yield* Effect.logInfo("Pruned old system logs").pipe(
      Effect.annotateLogs({
        component: "system",
        cutoff: cutoffIso,
        event: "system.logs.pruned",
        pruned,
      }),
    );
  }
});

export const startBackgroundWorkers = Effect.fn("api.background.start")(function* () {
  const appConfig = yield* AppConfig;
  const runtimeControl = yield* BackgroundWorkerController;
  const systemConfig = yield* SystemConfigService;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

  // A corrupt stored config must not brick startup: the API still boots so the
  // user can re-save config through the UI (the update service accepts writes
  // over corrupt state). Workers and the runtime snapshot run on defaults
  // until then. A missing row after bootstrap is a real bug and stays fatal.
  const config = yield* systemConfig.getConfig().pipe(
    Effect.catchTag("StoredConfigCorruptError", (error) =>
      Effect.logError(
        "Stored system config is corrupt; background workers start with default config until it is re-saved",
      ).pipe(
        Effect.annotateLogs(errorLogAnnotations(error)),
        // Hardcoded defaults cannot fail to compose; a failure here would be
        // an invariant violation, hence the defect.
        Effect.andThen(
          composeConfig(makeDefaultConfig(appConfig.databaseFile), DEFAULT_PROFILES).pipe(
            Effect.orDie,
          ),
        ),
        Effect.tap((defaults) => runtimeConfigSnapshot.replaceRuntimeConfig(defaults)),
      ),
    ),
  );

  yield* initializeBackgroundWorkerMetrics();
  yield* runtimeControl.start(config);
});

export const logServerListening = Effect.fn("api.server.logListening")(function* (
  config: AppConfigShape,
) {
  const address = yield* HttpServer.addressFormattedWith((value) => Effect.succeed(value));

  yield* Effect.logInfo("api server listening").pipe(
    Effect.annotateLogs(
      compactLogAnnotations({
        address,
        appVersion: config.appVersion,
        component: "api",
        event: "api.server.listening",
        port: config.port,
      }),
    ),
  );

  yield* Effect.addFinalizer(() => logServerStopping());
});

export const logServerStopping = Effect.fn("api.server.logStopping")(function* () {
  yield* Effect.logInfo("api server shutting down").pipe(
    Effect.annotateLogs({
      component: "api",
      event: "api.server.stopping",
    }),
  );
});
