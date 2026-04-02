import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Schema, Stream } from "effect";

import { SystemEventsService } from "@/features/system/system-events-service.ts";
import { authedRouteResponse } from "@/http/router-helpers.ts";
import { NotificationEventSchema } from "@packages/shared/index.ts";

const sseEncoder = new TextEncoder();
const encodeNotificationEvent = Schema.encodeSync(Schema.parseJson(NotificationEventSchema));

export const systemEventsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/events",
    authedRouteResponse(
      Effect.flatMap(SystemEventsService, (service) => service.buildEventsStream()),
      (stream) => {
        const sseStream = Stream.concat(
          Stream.fromIterable([sseEncoder.encode(": connected\n\n")]),
          Stream.merge(
            stream.pipe(
              Stream.map((event) =>
                sseEncoder.encode(`data: ${encodeNotificationEvent(event)}\n\n`),
              ),
            ),
            Stream.tick("15 seconds").pipe(Stream.as(sseEncoder.encode(": keep-alive\n\n"))),
          ).pipe(Stream.withSpan("http.events.stream")),
        );

        return Effect.succeed(
          HttpServerResponse.stream(sseStream, {
            contentType: "text/event-stream",
            headers: {
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          }),
        );
      },
    ),
  ),
);
