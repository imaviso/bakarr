import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import { Effect, Layer } from "effect";
import { createServer } from "node:http";

import { createHttpApp } from "@/app/http-app.ts";
import { bootstrapProgram, logServerListening, startBackgroundWorkers } from "@/app/startup.ts";
import { makeApiLifecycleLayers } from "@/app/lifecycle-layers.ts";

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
 * 4. **Bind HTTP** — Launch the HTTP server with the app runtime provided at
 *    the layer boundary; routes resolve services per request.
 *
 * If config decoding fails, startup fails fast.
 */
const runApiProgram = Effect.gen(function* () {
  const appLayer = makeApiLifecycleLayers().appLayer;

  const startup = Effect.gen(function* () {
    const config = yield* bootstrapProgram().pipe(Effect.withSpan("api.bootstrap"));

    yield* startBackgroundWorkers();

    const serverLayer = Layer.mergeAll(
      HttpRouter.serve(createHttpApp()),
      Layer.effectDiscard(logServerListening(config)),
    ).pipe(
      Layer.provide(
        NodeHttpServer.layer(
          () => {
            const srv = createServer();
            // Slowloris / stalled-request protections. @effect/platform-node's
            // serve layer exposes no timeout hooks, so set them on the raw Node
            // server (headersTimeout must be > keepAliveTimeout).
            srv.keepAliveTimeout = 5_000;
            srv.headersTimeout = 10_000;
            srv.requestTimeout = 60_000;
            return srv;
          },
          { port: config.port },
        ),
      ),
    );

    yield* Layer.launch(serverLayer);
  }).pipe(Effect.scoped, Effect.provide(appLayer));

  yield* startup;
});

if (import.meta.main) {
  NodeRuntime.runMain(runApiProgram);
}
