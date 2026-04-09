import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { SystemEventsService } from "@/features/system/system-events-service.ts";
import { buildNotificationEventSseStream } from "@/http/event-stream.ts";
import { authedRouteResponse } from "@/http/router-helpers.ts";

export const systemEventsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/events",
    authedRouteResponse(
      Effect.map(SystemEventsService, (service) => service.buildEventsStream()),
      (stream) =>
        HttpServerResponse.stream(buildNotificationEventSseStream(stream), {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }),
    ),
  ),
);
