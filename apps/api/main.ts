import { Effect } from "effect";

import type { Config } from "../../packages/shared/src/index.ts";
import { BackgroundWorkerController } from "./src/background.ts";
import { AppConfig, type AppConfigShape } from "./src/config.ts";
import { migrateDatabase } from "./src/db/migrate.ts";
import { AuthService } from "./src/features/auth/service.ts";
import { SystemService } from "./src/features/system/service.ts";
import { createApp } from "./src/http/app.ts";
import { createAppFetchHandler } from "./src/http/static.ts";
import {
  compactLogAnnotations,
  setRuntimeLogLevel,
} from "./src/lib/logging.ts";
import { makeApiRuntime, runApi } from "./src/runtime.ts";

const bootstrapProgram = Effect.fn("api.bootstrap")(function* () {
  yield* migrateDatabase();

  const auth = yield* AuthService;
  yield* auth.ensureBootstrapUser();

  const system = yield* SystemService;
  yield* system.ensureInitialized();

  return yield* AppConfig;
});

export async function bootstrap(overrides: Partial<AppConfigShape> = {}) {
  const runtime = makeApiRuntime(overrides);
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
  await import("@std/dotenv/load");
  const { app, config, runtime } = await bootstrap();
  const systemConfig = await runApi(
    runtime,
    Effect.flatMap(
      BackgroundWorkerController,
      (controller) =>
        Effect.gen(function* () {
          const cfg = yield* Effect.flatMap(
            SystemService,
            (s) => s.getConfig(),
          );
          yield* controller.start(cfg);
          return cfg;
        }),
    ),
  ) as Config;
  setRuntimeLogLevel(systemConfig.general.log_level);

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

  Deno.addSignalListener("SIGINT", () => {
    void shutdown().finally(() => Deno.exit(0));
  });

  Deno.addSignalListener("SIGTERM", () => {
    void shutdown().finally(() => Deno.exit(0));
  });

  Deno.serve(
    { port: config.port },
    createAppFetchHandler(app.fetch, (effect) => runApi(runtime, effect)),
  );
}
