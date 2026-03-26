import { HttpServer } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { Effect, Layer } from "effect";

import { BackgroundWorkerController } from "./src/background-controller.ts";
import { AppConfig, type AppConfigShape } from "./src/config.ts";
import { makeDotenvConfigProvider } from "./src/config-provider.ts";
import { migrateDatabase } from "./src/db/migrate.ts";
import { AuthService } from "./src/features/auth/service.ts";
import { StoredConfigCorruptError } from "./src/features/system/errors.ts";
import { SystemBootstrapService } from "./src/features/system/system-bootstrap-service.ts";
import { SystemConfigService } from "./src/features/system/system-config-service.ts";
import { createHttpApp } from "./src/http/http-app.ts";
import { compactLogAnnotations, setRuntimeLogLevel } from "./src/lib/logging.ts";
import { makeApiLayer, makeApiRuntime, type RuntimeOptions } from "./src/runtime.ts";

/**
 * Startup sequence (blocking, ordered, fail-fast):
 *
 * 1. **Migrate** — Run pending Drizzle migrations. Fails the process on error;
 *    no rollback or retry. See {@link migrateDatabase}.
 * 2. **Initialize config** — Insert default system config and quality profiles
 *    if the database is empty (first run). If config already exists it is left
 *    untouched — corrupt config is NOT repaired here; see getConfig for the
 *    repair contract. Applies stored log level if config is decodable.
 * 3. **Bootstrap user** — Create the initial admin user if no users exist.
 *    See {@link ensureBootstrapUser} in auth/service.ts for lifecycle details.
 * 4. **Return AppConfig** — Hand the resolved env config to the caller so it
 *    can bind the HTTP server.
 *
 * After bootstrap, main.ts loads the full Config via getConfig to start
 * background workers. If the stored config is corrupt at that point,
 * StoredConfigCorruptError is caught and background workers are skipped with a
 * warning — the API still starts so the operator can re-save config via the UI.
 */
const bootstrapProgram = Effect.fn("api.bootstrap")(function* () {
  yield* migrateDatabase();

  yield* (yield* SystemBootstrapService).ensureInitialized();

  const auth = yield* AuthService;
  yield* auth.ensureBootstrapUser();

  return yield* AppConfig;
});

const startBackgroundWorkers = Effect.fn("api.background.start")(function* () {
  const controller = yield* BackgroundWorkerController;
  const config = yield* (yield* SystemConfigService).getConfig().pipe(
    Effect.catchTag("StoredConfigCorruptError", (error: StoredConfigCorruptError) =>
      Effect.logWarning("Stored configuration is corrupt; skipping background worker startup").pipe(
        Effect.annotateLogs({
          component: "api",
          error: error.message,
          event: "api.background.start.skipped",
        }),
        Effect.as(null),
      ),
    ),
  );

  if (!config) {
    return;
  }

  setRuntimeLogLevel(config.general.log_level);
  yield* controller.start(config);
});

const logServerStarting = Effect.fn("api.server.logStarting")(function* (config: AppConfigShape) {
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

const logServerStopping = Effect.fn("api.server.logStopping")(function* () {
  yield* Effect.logInfo("api server shutting down").pipe(
    Effect.annotateLogs({
      component: "api",
      event: "api.server.stopping",
    }),
  );
});

const mainProgram = Effect.fn("api.main")(function* () {
  const config = yield* bootstrapProgram().pipe(Effect.withSpan("api.bootstrap"));
  const httpApp = yield* createHttpApp();

  yield* startBackgroundWorkers();
  yield* logServerStarting(config);
  yield* Effect.addFinalizer(() => logServerStopping());

  return yield* Layer.launch(
    HttpServer.serve(httpApp).pipe(Layer.provide(BunHttpServer.layer({ port: config.port }))),
  );
});

const loadDotenvConfigProvider = Effect.fn("api.loadDotenvConfigProvider")(function* () {
  return yield* makeDotenvConfigProvider().pipe(Effect.provide(BunFileSystem.layer));
});

export async function bootstrap(
  overrides: Partial<AppConfigShape> = {},
  runtimeOptions?: RuntimeOptions,
) {
  const runtime = makeApiRuntime(overrides, runtimeOptions);
  const config = await runtime.runPromise(
    bootstrapProgram().pipe(Effect.withSpan("api.bootstrap")),
  );

  const httpApp = await runtime.runPromise(createHttpApp());

  return {
    config,
    httpApp,
    runtime,
  };
}

if (import.meta.main) {
  const dotenvProvider = await Effect.runPromise(loadDotenvConfigProvider());
  BunRuntime.runMain(
    Effect.scoped(mainProgram()).pipe(
      Effect.provide(makeApiLayer({}, { configProvider: dotenvProvider })),
    ),
  );
}
