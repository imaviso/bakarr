import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";
import { AsyncOperationAcceptedSchema } from "@packages/shared/index.ts";

import { BackgroundTaskRunner } from "@/background/task-runner.ts";
import { authedRouteResponse, schemaAcceptedResponse } from "@/infra/http/router-helpers.ts";

const acceptedOperationResponse = schemaAcceptedResponse(AsyncOperationAcceptedSchema);

export const systemTasksRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/system/tasks/scan",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.startLibraryScan()),
      acceptedOperationResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/rss",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.startRssProcessing()),
      acceptedOperationResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/metadata-refresh",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.startMetadataRefresh()),
      acceptedOperationResponse,
    ),
  ),
);
