import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Stream } from "effect";

import { assert, it } from "@effect/vitest";
import { buildSystemEventsResponse } from "@/http/system/events-router.ts";

it.effect("events router returns NDJSON response without websocket upgrade headers", () =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(new Request("http://bakarr.local/api/events"));
    const response = yield* buildSystemEventsResponse(
      Stream.fromIterable([
        {
          payload: { message: "hello" },
          type: "Info" as const,
        },
      ]),
    ).pipe(Effect.provideService(HttpServerRequest.HttpServerRequest, request));

    assert.deepStrictEqual(response.status, 200);
    assert.deepStrictEqual(response.headers["content-type"], "application/x-ndjson");
    assert.deepStrictEqual(
      yield* Effect.promise(() => HttpServerResponse.toWeb(response).text()),
      '{"type":"Info","payload":{"message":"hello"}}\n',
    );
  }),
);

it.effect("events router websocket branch fails when upgrade support is unavailable", () =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(
      new Request("http://bakarr.local/api/events", {
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
        },
      }),
    );

    const exit = yield* Effect.exit(
      buildSystemEventsResponse(
        Stream.fromIterable([
          {
            payload: { message: "hello" },
            type: "Info" as const,
          },
        ]),
      ).pipe(Effect.provideService(HttpServerRequest.HttpServerRequest, request)),
    );

    assert.deepStrictEqual(exit._tag, "Failure");
  }),
);
