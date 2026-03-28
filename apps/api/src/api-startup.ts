import { Effect } from "effect";

import { BackgroundWorkerController } from "./background-controller.ts";
import { AppConfig, type AppConfigShape } from "./config.ts";
import { migrateDatabase } from "./db/migrate.ts";
import { AuthBootstrapService } from "./features/auth/bootstrap-service.ts";
import { SystemBootstrapService } from "./features/system/system-bootstrap-service.ts";
import { SystemConfigService } from "./features/system/system-config-service.ts";
import { compactLogAnnotations } from "./lib/logging.ts";

export const bootstrapProgram = Effect.fn("api.bootstrap")(function* () {
  yield* migrateDatabase();

  yield* (yield* SystemBootstrapService).ensureInitialized();

  const auth = yield* AuthBootstrapService;
  yield* auth.ensureBootstrapUser();

  return yield* AppConfig;
});

export const startBackgroundWorkers = Effect.fn("api.background.start")(function* () {
  const runtimeControl = yield* BackgroundWorkerController;
  const config = yield* (yield* SystemConfigService).getConfig();

  yield* runtimeControl.start(config);
});

export const logServerStarting = Effect.fn("api.server.logStarting")(function* (
  config: AppConfigShape,
) {
  yield* Effect.logInfo("api server starting").pipe(
    Effect.annotateLogs(
      compactLogAnnotations({
        appVersion: config.appVersion,
        component: "api",
        event: "api.server.starting",
        port: config.port,
      }),
    ),
  );
});

export const logServerStopping = Effect.fn("api.server.logStopping")(function* () {
  yield* Effect.logInfo("api server shutting down").pipe(
    Effect.annotateLogs({
      component: "api",
      event: "api.server.stopping",
    }),
  );
});
