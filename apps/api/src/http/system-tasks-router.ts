import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { BackgroundTaskRunner } from "@/background-task-runner.ts";
import { authedRouteResponse, successResponse } from "@/http/router-helpers.ts";

export const systemTasksRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/system/tasks/scan",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.runLibraryScanWorkerTask()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/rss",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.runRssWorkerTask()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/metadata-refresh",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.runMetadataRefreshWorkerTask()),
      successResponse,
    ),
  ),
);
