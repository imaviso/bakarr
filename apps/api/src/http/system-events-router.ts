import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { SystemEventsService } from "@/features/system/system-events-service.ts";
import { authedRouteResponse } from "@/http/router-helpers.ts";

export const systemEventsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/events",
    authedRouteResponse(
      Effect.flatMap(SystemEventsService, (service) => service.buildEventsStream()),
      (stream) =>
        Effect.succeed(
          HttpServerResponse.stream(stream, {
            contentType: "text/event-stream",
            headers: {
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          }),
        ),
    ),
  ),
);
