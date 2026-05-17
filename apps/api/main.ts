import { HttpServer } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Effect, Layer } from "effect";
import { createServer } from "node:http";

import { makeDotenvConfigProvider } from "./src/config/provider.ts";
import { createHttpApp } from "./src/http/http-app.ts";
import { bootstrapProgram, logServerListening, startBackgroundWorkers } from "./src/app/startup.ts";
import { makeApiLifecycleLayers } from "./src/app/lifecycle-layers.ts";

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

  const serverLayer = Layer.mergeAll(
    HttpServer.serve(httpApp),
    Layer.scopedDiscard(logServerListening(config)),
  ).pipe(
    Layer.provide(
      NodeHttpServer.layer(
        () => {
          const srv = createServer();
          srv.keepAliveTimeout = 5000;
          return srv;
        },
        { port: config.port },
      ),
    ),
  );

  return yield* Layer.launch(serverLayer);
});

const loadDotenvConfigProvider = Effect.fn("api.loadDotenvConfigProvider")(function* () {
  return yield* makeDotenvConfigProvider().pipe(Effect.provide(NodeFileSystem.layer));
});

const runApiProgram = Effect.fn("api.run")(function* () {
  const dotenvProvider = yield* loadDotenvConfigProvider();
  const appLayer = makeApiLifecycleLayers({}, { configProvider: dotenvProvider }).appLayer;

  return yield* Effect.scoped(mainProgram()).pipe(Effect.provide(appLayer));
});

if (import.meta.main) {
  NodeRuntime.runMain(runApiProgram());
}
