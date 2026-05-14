import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { BackgroundJobStatusService } from "@/features/system/background-job-status-service.ts";
import { ObservabilityConfig } from "@/config/observability.ts";
import {
  decodeOperationsTaskQuery,
  OperationsTaskReadService,
} from "@/features/operations/operations-task-service.ts";
import { makeObservabilityStatus } from "@/features/system/observability-status.ts";
import { SystemReadService } from "@/features/system/system-read-service.ts";
import {
  OperationsTaskIdParamsSchema,
  OperationsTaskQuerySchema,
} from "@/http/anime/request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
} from "@/http/shared/router-helpers.ts";

export const infoRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/observability",
    authedRouteResponse(
      Effect.gen(function* () {
        return makeObservabilityStatus(yield* ObservabilityConfig);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/dashboard",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getDashboard()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/jobs",
    authedRouteResponse(
      Effect.flatMap(BackgroundJobStatusService, (service) =>
        service.getSnapshot().pipe(Effect.map((snapshot) => snapshot.jobs)),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/tasks",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(OperationsTaskQuerySchema, "system tasks");
        const decoded = yield* decodeOperationsTaskQuery(query);
        return yield* (yield* OperationsTaskReadService).listTasks({
          ...decoded,
          excludeTaskKeys: ["anime_scan_folder", "library_import"],
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(OperationsTaskIdParamsSchema);
        return yield* (yield* OperationsTaskReadService).getTask(params.taskId);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/stats",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getLibraryStats()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/activity",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getActivity()),
      jsonResponse,
    ),
  ),
);
