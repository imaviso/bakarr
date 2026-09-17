// oxlint-disable typescript/no-restricted-types -- Logger messages and annotations are unknown boundaries.
import { assert, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Logger, References } from "effect";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { AuthUnauthorizedError } from "@/features/auth/errors.ts";
import { CurrentRequestLog, withRequestLogging } from "@/infra/http/request-logging.ts";
import { routeResponse } from "@/infra/http/router-helpers.ts";

for (const status of [200, 401, 500]) {
  it.effect(`request completion logs once for status ${status}, excluding secrets`, () =>
    Effect.gen(function* () {
      const logs: Array<{ level: string; annotations: Record<string, unknown> }> = [];
      const logger = Logger.make(({ logLevel, fiber }) => {
        logs.push({ level: logLevel, annotations: fiber.getRef(References.CurrentLogAnnotations) });
      });
      const route = Effect.gen(function* () {
        const context = yield* CurrentRequestLog;
        if (context) context.userId = 42;
        if (status === 401) {
          return yield* routeResponse(
            Effect.fail(new AuthUnauthorizedError({ message: "secret-password" })),
            () => Effect.succeed(HttpServerResponse.empty()),
          );
        }
        return HttpServerResponse.empty({ status });
      });
      const response = yield* route.pipe(
        withRequestLogging,
        HttpMiddleware.logger,
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(
            new Request("http://bakarr.local/api/test?token=secret-token", {
              headers: { authorization: "Bearer secret-key" },
            }),
          ),
        ),
        Effect.provide(Logger.layer([logger])),
      );
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0]?.level, status === 500 ? "Error" : "Info");
      assert.strictEqual(logs[0]?.annotations["http_status"], status);
      assert.strictEqual(logs[0]?.annotations["http_path"], "/api/test");
      assert.strictEqual(logs[0]?.annotations["userId"], 42);
      assert.strictEqual(logs[0]?.annotations["durationMs"], 0);
      assert.strictEqual(logs[0]?.annotations["requestId"], response.headers["x-request-id"]);
      if (status === 401)
        assert.strictEqual(logs[0]?.annotations["error_kind"], "AuthUnauthorizedError");
      assert.isFalse(JSON.stringify(logs).includes("secret-"));
    }),
  );
}

it.effect("request completion preserves interruption and records it once", () =>
  Effect.gen(function* () {
    const outcomes: unknown[] = [];
    const logger = Logger.make(({ fiber }) => {
      outcomes.push(fiber.getRef(References.CurrentLogAnnotations)["outcome"]);
    });
    const exit = yield* Effect.interrupt.pipe(
      withRequestLogging,
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request("http://bakarr.local/api/test")),
      ),
      Effect.provide(Layer.mergeAll(Logger.layer([logger]))),
      Effect.exit,
    );
    assert.isTrue(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause));
    assert.deepStrictEqual(outcomes, ["interrupted"]);
  }),
);
