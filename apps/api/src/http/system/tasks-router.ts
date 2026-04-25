import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { BackgroundTaskRunner } from "@/background/task-runner.ts";
import { OperationsTaskLauncherService } from "@/features/operations/operations-task-launcher-service.ts";
import { acceptedResponse, authedRouteResponse } from "@/http/shared/router-helpers.ts";

export const systemTasksRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/system/tasks/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const runner = yield* BackgroundTaskRunner;
        return yield* (yield* OperationsTaskLauncherService).launch({
          failureMessage: "Manual system scan task failed",
          operation: () => runner.runLibraryScanWorkerTask(),
          queuedMessage: "Queued manual system scan task",
          runningMessage: "Running manual system scan task",
          successMessage: () => "Manual system scan task finished",
          taskKey: "system_task_scan_manual",
        });
      }),
      acceptedResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const runner = yield* BackgroundTaskRunner;
        return yield* (yield* OperationsTaskLauncherService).launch({
          failureMessage: "Manual RSS task failed",
          operation: () => runner.runRssWorkerTask(),
          queuedMessage: "Queued manual RSS task",
          runningMessage: "Running manual RSS task",
          successMessage: () => "Manual RSS task finished",
          taskKey: "system_task_rss_manual",
        });
      }),
      acceptedResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/metadata-refresh",
    authedRouteResponse(
      Effect.gen(function* () {
        const runner = yield* BackgroundTaskRunner;
        return yield* (yield* OperationsTaskLauncherService).launch({
          failureMessage: "Manual metadata refresh task failed",
          operation: () => runner.runMetadataRefreshWorkerTask(),
          queuedMessage: "Queued manual metadata refresh task",
          runningMessage: "Running manual metadata refresh task",
          successMessage: () => "Manual metadata refresh task finished",
          taskKey: "system_task_metadata_refresh_manual",
        });
      }),
      acceptedResponse,
    ),
  ),
);
