import { Effect } from "effect";

import { BackgroundWorkerController } from "./src/background.ts";
import { AppConfig, type AppConfigShape } from "./src/config.ts";
import { makeDotenvConfigProvider } from "./src/config-provider.ts";
import { migrateDatabase } from "./src/db/migrate.ts";
import { AuthService } from "./src/features/auth/service.ts";
import { StoredConfigCorruptError } from "./src/features/system/errors.ts";
import { SystemService } from "./src/features/system/service.ts";
import { createApp } from "./src/http/app.ts";
import { createAppFetchHandler } from "./src/http/static.ts";
import {
  compactLogAnnotations,
  setRuntimeLogLevel,
} from "./src/lib/logging.ts";
import { makeApiRuntime, runApi, type RuntimeOptions } from "./src/runtime.ts";

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

  const app = createApp((effect) => runApi(runtime, effect));

  return {
    app,
    config,
    runtime,
  };
}

if (import.meta.main) {
  const dotenvProvider = await Effect.runPromise(makeDotenvConfigProvider());
  const { app, config, runtime } = await bootstrap({}, {
    configProvider: dotenvProvider,
  });
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
    await runApi(
      runtime,
      Effect.flatMap(BackgroundWorkerController, (c) => c.stop()),
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

  const abortController = new AbortController();
  const requestShutdown = () => {
    void shutdownOnce().finally(() => {
      abortController.abort();
    });
  };

  Deno.addSignalListener("SIGINT", requestShutdown);
  Deno.addSignalListener("SIGTERM", requestShutdown);

  const server = Deno.serve({
    handler: createAppFetchHandler(
      app.fetch,
      (effect) => runApi(runtime, effect),
    ),
    port: config.port,
    signal: abortController.signal,
  });

  await server.finished;
  Deno.removeSignalListener("SIGINT", requestShutdown);
  Deno.removeSignalListener("SIGTERM", requestShutdown);
  await shutdownOnce();
}
