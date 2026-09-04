import * as HttpRouter from "effect/unstable/http/HttpRouter";
import { Effect, Layer } from "effect";
import { AsyncOperationAcceptedSchema } from "@packages/shared/index.ts";

import { BackgroundTaskRunner } from "@/background/task-runner.ts";
import { authedRouteResponse, schemaAcceptedResponse } from "@/infra/http/router-helpers.ts";

const acceptedOperationResponse = schemaAcceptedResponse(AsyncOperationAcceptedSchema);

export const systemTasksRouter = Layer.mergeAll(
  HttpRouter.add(
    "POST",
    "/api/system/tasks/scan",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.startLibraryScan()),
      acceptedOperationResponse,
    ),
  ),
  HttpRouter.add(
    "POST",
    "/api/system/tasks/rss",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.startRssProcessing()),
      acceptedOperationResponse,
    ),
  ),
  HttpRouter.add(
    "POST",
    "/api/system/tasks/metadata-refresh",
    authedRouteResponse(
      Effect.flatMap(BackgroundTaskRunner, (runner) => runner.startMetadataRefresh()),
      acceptedOperationResponse,
    ),
  ),
);
