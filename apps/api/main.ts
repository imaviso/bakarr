import { HttpServer } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { Effect, Layer, ManagedRuntime } from "effect";

import type { AppConfigShape } from "./src/config.ts";
import { makeDotenvConfigProvider } from "./src/config-provider.ts";
import { createHttpApp } from "./src/http/http-app.ts";
import {
  bootstrapProgram,
  logServerStarting,
  logServerStopping,
  startBackgroundWorkers,
} from "./src/api-startup.ts";
import { makeApiLifecycleLayers } from "./src/api-lifecycle-layers.ts";

type RuntimeOptions = Parameters<typeof makeApiLifecycleLayers>[1];

function makeApiRuntime(overrides: Partial<AppConfigShape> = {}, options?: RuntimeOptions) {
  return ManagedRuntime.make(makeApiLifecycleLayers(overrides, options).appLayer);
}

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
 *    See {@link ensureBootstrapUser} in auth/bootstrap-service.ts for lifecycle details.
 * 4. **Return AppConfig** — Hand the resolved env config to the caller so it
 *    can bind the HTTP server.
 *
 * After bootstrap, main.ts loads the full Config via getConfig to start
 * background workers. If config decoding fails, startup fails fast.
 */
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
      Effect.provide(makeApiLifecycleLayers({}, { configProvider: dotenvProvider }).appLayer),
    ),
  );
}
