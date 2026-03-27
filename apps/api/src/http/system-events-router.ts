import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { EventBus } from "../features/events/event-bus.ts";
import { CatalogOrchestration } from "../features/operations/operations-orchestration.ts";
import { buildDownloadProgressResponse } from "./event-stream.ts";
import { authedRouteResponse } from "./router-helpers.ts";

export const systemEventsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const downloads = yield* (yield* CatalogOrchestration).getDownloadProgress();
        const eventBus = yield* EventBus;
        return { downloads, eventBus };
      }),
      ({ downloads, eventBus }) =>
        Effect.succeed(buildDownloadProgressResponse(downloads, eventBus)),
    ),
  ),
);
