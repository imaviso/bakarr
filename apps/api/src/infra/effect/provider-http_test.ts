// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)

import * as TestClock from "effect/testing/TestClock";
import { Effect, Fiber, Schema } from "effect";
import { assert, it } from "@effect/vitest";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { callProviderJson, executeProviderRequest } from "@/infra/effect/provider-http.ts";
import { ExternalCall, ExternalCallLive } from "@/infra/effect/retry.ts";

const PayloadSchema = Schema.Struct({
  ok: Schema.Boolean,
});

function makeStatusClient(respond: (call: number) => { status: number; body: string }) {
  let calls = 0;
  const client = HttpClient.make((request, _url, _signal, _fiber) =>
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

    const fiber = yield* Effect.forkChild(
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

    const fiber = yield* Effect.forkChild(
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

    const result = yield* Effect.result(
      callProviderJson({
        client,
        externalCall,
        failureMessage: "Test op",
        operation: "test.op",
        request: HttpClientRequest.get("https://example.com"),
        schema: PayloadSchema,
      }),
    );

    assert.deepStrictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      assert.deepStrictEqual(result.failure.operation, "test.op.json");
    }
    assert.deepStrictEqual(callCount(), 1);
  }).pipe(Effect.provide(ExternalCallLive)),
);
