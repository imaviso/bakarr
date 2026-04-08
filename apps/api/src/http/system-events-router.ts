import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Stream } from "effect";

import { SystemEventsService } from "@/features/system/system-events-service.ts";
import { encodeNotificationEventSse } from "@/http/event-stream.ts";
import { authedRouteResponse } from "@/http/router-helpers.ts";

const sseEncoder = new TextEncoder();

export const systemEventsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/events",
    authedRouteResponse(
      Effect.map(SystemEventsService, (service) => service.buildEventsStream()),
      (stream) => {
        const sseStream = Stream.concat(
          Stream.fromIterable([sseEncoder.encode(": connected\n\n")]),
          Stream.merge(
            stream.pipe(Stream.mapEffect(encodeNotificationEventSse)),
            Stream.tick("15 seconds").pipe(Stream.as(sseEncoder.encode(": keep-alive\n\n"))),
          ).pipe(Stream.withSpan("http.events.stream")),
        );

        return HttpServerResponse.stream(sseStream, {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    ),
  ),
);
