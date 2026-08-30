import { HttpServerRequest, HttpServerResponse, Socket } from "@effect/platform";
import { Effect, Stream } from "effect";

import { assert, it } from "@effect/vitest";
import type { NotificationEvent } from "@packages/shared/index.ts";
import { buildSystemEventsResponse } from "@/features/system/http/events-router.ts";

const infoEvent: NotificationEvent = { payload: { message: "hello" }, type: "Info" };

it.effect("events router returns NDJSON response without websocket upgrade headers", () =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(new Request("http://bakarr.local/api/events"));
    const response = yield* buildSystemEventsResponse(Stream.fromIterable([infoEvent])).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
    );

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
      buildSystemEventsResponse(Stream.fromIterable([infoEvent])).pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      ),
    );

    assert.deepStrictEqual(exit._tag, "Failure");
  }),
);

it.effect("events router treats websocket 1001 close as normal disconnect", () =>
  Effect.gen(function* () {
    const baseRequest = HttpServerRequest.fromWeb(
      new Request("http://bakarr.local/api/events", {
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
        },
      }),
    );
    const closeError = new Socket.SocketCloseError({ code: 1001, reason: "Close" });
    const closingSocket: Socket.Socket = {
      [Socket.TypeId]: Socket.TypeId,
      run: () => Effect.fail(closeError),
      runRaw: () => Effect.fail(closeError),
      writer: Effect.succeed(() => Effect.void),
    };
    const request: HttpServerRequest.HttpServerRequest = {
      ...baseRequest,
      headers: baseRequest.headers,
      upgrade: Effect.succeed(closingSocket),
    };

    const response = yield* buildSystemEventsResponse(Stream.never).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
    );

    assert.deepStrictEqual(response.status, 204);
  }),
);
