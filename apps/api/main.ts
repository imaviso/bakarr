import { NodeFileSystem } from "@effect/platform-node";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { Effect } from "effect";
import { createServer } from "node:http";
import process from "node:process";

import { BackgroundWorkerController } from "./src/background.ts";
import { AppConfig, type AppConfigShape } from "./src/config.ts";
import { makeDotenvConfigProvider } from "./src/config-provider.ts";
import { migrateDatabase } from "./src/db/migrate.ts";
import { AuthService } from "./src/features/auth/service.ts";
import { StoredConfigCorruptError } from "./src/features/system/errors.ts";
import { SystemService } from "./src/features/system/service.ts";
import { createHttpApp } from "./src/http/http-app.ts";
import {
  compactLogAnnotations,
  setRuntimeLogLevel,
} from "./src/lib/logging.ts";
import { makeApiRuntime, runApi, type RuntimeOptions } from "./src/runtime.ts";

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

  const system = yield* SystemService;
  yield* system.ensureInitialized();

  const auth = yield* AuthService;
  yield* auth.ensureBootstrapUser();

  return yield* AppConfig;
});

export async function bootstrap(
  overrides: Partial<AppConfigShape> = {},
  runtimeOptions?: RuntimeOptions,
) {
  const runtime = makeApiRuntime(overrides, runtimeOptions);
  const config = await runApi(
    runtime,
    bootstrapProgram().pipe(Effect.withSpan("api.bootstrap")),
  );

  const httpApp = await runApi(
    runtime,
    createHttpApp(),
  );

  return {
    config,
    httpApp,
    runtime,
  };
}

if (import.meta.main) {
  const dotenvProvider = await Effect.runPromise(
    makeDotenvConfigProvider().pipe(Effect.provide(NodeFileSystem.layer)),
  );
  const { config, runtime } = await bootstrap({}, {
    configProvider: dotenvProvider,
  });
  const httpApp = await runApi(
    runtime,
    createHttpApp(),
  );
  await runApi(
    runtime,
    Effect.flatMap(
      BackgroundWorkerController,
      (controller) =>
        Effect.gen(function* () {
          const cfg = yield* Effect.flatMap(
            SystemService,
            (s) => s.getConfig(),
          ).pipe(
            Effect.catchTag(
              "StoredConfigCorruptError",
              (error: StoredConfigCorruptError) =>
                Effect.logWarning(
                  "Stored configuration is corrupt; skipping background worker startup",
                ).pipe(
                  Effect.annotateLogs({
                    component: "api",
                    error: error.message,
                    event: "api.background.start.skipped",
                  }),
                  Effect.as(null),
                ),
            ),
          );

          if (!cfg) {
            return;
          }

          setRuntimeLogLevel(cfg.general.log_level);
          yield* controller.start(cfg);
        }),
    ),
  );

  await runApi(
    runtime,
    Effect.logInfo("api server starting").pipe(
      Effect.annotateLogs(
        compactLogAnnotations({
          appVersion: config.appVersion,
          component: "api",
          event: "api.server.starting",
          port: config.port,
        }),
      ),
    ),
  );

  const shutdown = async () => {
    await runApi(
      runtime,
      Effect.logInfo("api server shutting down").pipe(
        Effect.annotateLogs({
          component: "api",
          event: "api.server.stopping",
        }),
      ),
    ).catch(() => undefined);
    await runtime.dispose();
  };

  let shutdownPromise: Promise<void> | undefined;
  const shutdownOnce = () => {
    if (!shutdownPromise) {
      shutdownPromise = shutdown();
    }

    return shutdownPromise;
  };

  const nodeHandler = await runApi(
    runtime,
    NodeHttpServer.makeHandler(httpApp),
  );
  const server = createServer(nodeHandler);
  const serverClosed = new Promise<void>((resolve, reject) => {
    server.once("close", resolve);
    server.once("error", reject);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, resolve);
  });

  const requestShutdown = () => {
    server.close(() => {
      void shutdownOnce();
    });
  };

  process.on("SIGINT", requestShutdown);
  process.on("SIGTERM", requestShutdown);

  await serverClosed;

  process.off("SIGINT", requestShutdown);
  process.off("SIGTERM", requestShutdown);
  await shutdownOnce();
}
