import { HttpServer } from "@effect/platform";
import { Effect } from "effect";

import { BackgroundWorkerController } from "@/background/controller-core.ts";
import { AppConfig, type AppConfigShape } from "@/config/schema.ts";
import { migrateDatabase } from "@/db/migrate.ts";
import { AuthBootstrapService } from "@/features/auth/bootstrap-service.ts";
import { SystemBootstrapService } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigService } from "@/features/system/system-config-service.ts";
import { compactLogAnnotations } from "@/infra/logging.ts";

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
