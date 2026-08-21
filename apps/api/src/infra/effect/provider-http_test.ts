// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { assert, it } from "@effect/vitest";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Effect, Fiber, Schema, TestClock } from "effect";

import { callProviderJson, executeProviderRequest } from "@/infra/effect/provider-http.ts";
import { ExternalCall, ExternalCallLive } from "@/infra/effect/retry.ts";

const PayloadSchema = Schema.Struct({
  ok: Schema.Boolean,
});

function makeStatusClient(respond: (call: number) => { status: number; body: string }) {
  let calls = 0;
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      calls += 1;
      const response = respond(calls);
      return HttpClientResponse.fromWeb(
        request,
        new Response(response.body, {
          headers: { "content-type": "application/json" },
          status: response.status,
        }),
      );
    }),
  );
  return {
    client,
    callCount: () => calls,
  };
}

it.effect("executeProviderRequest retries 429 responses and succeeds", () =>
  Effect.gen(function* () {
    const { client, callCount } = makeStatusClient((call) => ({
      status: call < 3 ? 429 : 200,
      body: "{}",
    }));
    const externalCall = yield* ExternalCall;

    const fiber = yield* Effect.fork(
      executeProviderRequest({
        client,
        externalCall,
        failureMessage: "Test op",
        operation: "test.op",
        request: HttpClientRequest.get("https://example.com"),
      }),
    );
    yield* TestClock.adjust("5 seconds");
    const response = yield* Fiber.join(fiber);

    assert.deepStrictEqual(response.status, 200);
    assert.deepStrictEqual(callCount(), 3);
  }).pipe(Effect.provide(ExternalCallLive)),
);

it.effect("executeProviderRequest retries 5xx responses and succeeds", () =>
  Effect.gen(function* () {
    const { client, callCount } = makeStatusClient((call) => ({
      status: call === 1 ? 503 : 200,
      body: "{}",
    }));
    const externalCall = yield* ExternalCall;

    const fiber = yield* Effect.fork(
      executeProviderRequest({
        client,
        externalCall,
        failureMessage: "Test op",
        operation: "test.op",
        request: HttpClientRequest.get("https://example.com"),
      }),
    );
    yield* TestClock.adjust("5 seconds");
    const response = yield* Fiber.join(fiber);

    assert.deepStrictEqual(response.status, 200);
    assert.deepStrictEqual(callCount(), 2);
  }).pipe(Effect.provide(ExternalCallLive)),
);

it.effect("callProviderJson does not burn retries on decode failures", () =>
  Effect.gen(function* () {
    const { client, callCount } = makeStatusClient(() => ({
      status: 200,
      body: '{"nope":true}',
    }));
    const externalCall = yield* ExternalCall;

    const result = yield* Effect.either(
      callProviderJson({
        client,
        externalCall,
        failureMessage: "Test op",
        operation: "test.op",
        request: HttpClientRequest.get("https://example.com"),
        schema: PayloadSchema,
      }),
    );

    assert.deepStrictEqual(result._tag, "Left");
    if (result._tag === "Left") {
      assert.deepStrictEqual(result.left.operation, "test.op.json");
    }
    assert.deepStrictEqual(callCount(), 1);
  }).pipe(Effect.provide(ExternalCallLive)),
);
