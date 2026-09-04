import { Effect, Stream } from "effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { SocketCloseError, SocketError } from "effect/unstable/socket/Socket";
import * as SocketTypes from "effect/unstable/socket/Socket";

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
    const closeError = new SocketCloseError({ code: 1001, closeReason: "Close" });
    const socketError = new SocketError({ reason: closeError });
    const closingSocket: SocketTypes.Socket = {
      [SocketTypes.TypeId]: SocketTypes.TypeId,
      run: () => Effect.fail(socketError),
      runRaw: () => Effect.fail(socketError),
      runString: () => Effect.fail(socketError),
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
