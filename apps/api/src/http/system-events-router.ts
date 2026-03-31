import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { EventBus } from "@/features/events/event-bus.ts";
import { DownloadProgressService } from "@/features/operations/catalog-download-view-support.ts";
import { buildDownloadProgressStream } from "@/http/event-stream.ts";
import { authedRouteResponse } from "@/http/router-helpers.ts";

export const systemEventsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const downloads = yield* (yield* DownloadProgressService).getDownloadProgress();
        const eventBus = yield* EventBus;
        return { downloads, eventBus };
      }),
      ({ downloads, eventBus }) =>
        Effect.succeed(
          HttpServerResponse.stream(buildDownloadProgressStream(downloads, eventBus), {
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
