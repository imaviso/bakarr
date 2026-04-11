import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Stream } from "effect";

import type { NotificationEvent } from "@packages/shared/index.ts";
import { SystemEventsService } from "@/features/system/system-events-service.ts";
import { encodeNotificationEventJson } from "@/http/event-socket.ts";
import { authedRouteResponse } from "@/http/router-helpers.ts";

export const buildSystemEventsResponse = Effect.fn("Http.buildSystemEventsResponse")(function* <E>(
  events: Stream.Stream<NotificationEvent, E>,
) {
  const request = yield* HttpServerRequest.HttpServerRequest;

  if (!isWebSocketUpgradeRequest(request)) {
    return HttpServerResponse.stream(encodeNotificationEventStream(events), {
      contentType: "application/x-ndjson",
    });
  }

  return yield* encodeNotificationEventStream(events).pipe(
    Stream.pipeThroughChannel(HttpServerRequest.upgradeChannel()),
    Stream.runDrain,
    Effect.as(HttpServerResponse.empty()),
  );
});

export const systemEventsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/events",
    authedRouteResponse(
      Effect.map(SystemEventsService, (service) => service.buildEventsStream()),
      buildSystemEventsResponse,
    ),
  ),
);

function encodeNotificationEventStream<E>(events: Stream.Stream<NotificationEvent, E>) {
  return events.pipe(
    Stream.mapEffect(encodeNotificationEventJson),
    Stream.map((line) => `${line}\n`),
    Stream.encodeText,
  );
}

function isWebSocketUpgradeRequest(request: HttpServerRequest.HttpServerRequest) {
  const upgrade = request.headers["upgrade"];
  const connection = request.headers["connection"];

  if (typeof upgrade !== "string" || typeof connection !== "string") {
    return false;
  }

  if (upgrade.toLowerCase() !== "websocket") {
    return false;
  }

  return connection
    .toLowerCase()
    .split(",")
    .some((value) => value.trim() === "upgrade");
}
