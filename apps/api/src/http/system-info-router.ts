import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { BackgroundJobStatusService } from "@/features/system/background-job-status-service.ts";
import {
  decodeOperationsTaskQuery,
  OperationsTaskService,
} from "@/features/operations/operations-task-service.ts";
import { SystemActivityReadService } from "@/features/system/system-activity-read-service.ts";
import { SystemDashboardReadService } from "@/features/system/system-dashboard-read-service.ts";
import { SystemLibraryStatsReadService } from "@/features/system/system-library-stats-read-service.ts";
import {
  OperationsTaskIdParamsSchema,
  OperationsTaskQuerySchema,
} from "@/http/anime-request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
} from "@/http/router-helpers.ts";

export const infoRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/dashboard",
    authedRouteResponse(
      Effect.flatMap(SystemDashboardReadService, (service) => service.getDashboard()),
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
        // TODO: Move key exclusion to DB query instead of filtering in JS after fetching
        return yield* (yield* OperationsTaskService)
          .listTasks(decoded)
          .pipe(
            Effect.map((tasks) =>
              tasks.filter(
                (task) =>
                  task.task_key !== "anime_scan_folder" && task.task_key !== "library_import",
              ),
            ),
          );
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(OperationsTaskIdParamsSchema);
        return yield* (yield* OperationsTaskService).getTask(params.taskId);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/stats",
    authedRouteResponse(
      Effect.flatMap(SystemLibraryStatsReadService, (service) => service.getLibraryStats()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/activity",
    authedRouteResponse(
      Effect.flatMap(SystemActivityReadService, (service) => service.getActivity()),
      jsonResponse,
    ),
  ),
);
