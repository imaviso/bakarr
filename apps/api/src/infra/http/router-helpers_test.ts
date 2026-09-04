// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)

import { Cause, Effect, Exit, Logger } from "effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { assert, it } from "@effect/vitest";
import { AuthUnauthorizedError } from "@/features/auth/errors.ts";
import { routeResponse } from "@/infra/http/router-helpers.ts";

const stubRequest = HttpServerRequest.fromWeb(new Request("http://bakarr.local/api/test"));

const runRoute = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  routeResponse(effect, () => Effect.succeed(HttpServerResponse.empty())).pipe(
    Effect.provideService(HttpServerRequest.HttpServerRequest, stubRequest),
  );

it.effect("routeResponse re-interrupts interrupt-only causes without a 500 response", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(runRoute(Effect.interrupt));

    assert.deepStrictEqual(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause), true);
  }),
);

it.effect("routeResponse logs no error for interrupted routes", () =>
  Effect.gen(function* () {
    const messages: string[] = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      messages.push(globalThis.String(message));
    });

    yield* Effect.exit(runRoute(Effect.interrupt).pipe(Effect.provide(Logger.layer([logger]))));

    assert.deepStrictEqual(
      messages.some((message) => message.includes("HTTP route failed")),
      false,
    );
  }),
);

it.effect("routeResponse still maps real failures to error responses", () =>
  Effect.gen(function* () {
    const response = yield* runRoute(Effect.fail(new AuthUnauthorizedError({ message: "nope" })));

    assert.deepStrictEqual(response.status, 401);
  }),
);
