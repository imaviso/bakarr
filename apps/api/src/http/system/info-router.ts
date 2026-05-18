import { HttpRouter } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  ActivityItemSchema,
  BackgroundJobStatusSchema,
  LibraryStatsSchema,
  ObservabilityStatusSchema,
  OperationTaskSchema,
  OpsDashboardSchema,
} from "@packages/shared/index.ts";

import { BackgroundJobStatusService } from "@/features/system/background-job-status-service.ts";
import { ObservabilityConfig } from "@/config/observability.ts";
import {
  decodeOperationsTaskQuery,
  OperationsTaskReadService,
} from "@/features/operations/tasks/operations-task-service.ts";
import { makeObservabilityStatus } from "@/features/system/observability-status.ts";
import { SystemReadService } from "@/features/system/system-read-service.ts";
import {
  OperationsTaskIdParamsSchema,
  OperationsTaskQuerySchema,
} from "@/http/media/request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQueryWithLabel,
  schemaJsonResponse,
} from "@/http/shared/router-helpers.ts";

export const infoRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/observability",
    authedRouteResponse(
      Effect.gen(function* () {
        return makeObservabilityStatus(yield* ObservabilityConfig);
      }),
      schemaJsonResponse(ObservabilityStatusSchema),
    ),
  ),
  HttpRouter.get(
    "/api/system/dashboard",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getDashboard()),
      schemaJsonResponse(OpsDashboardSchema),
    ),
  ),
  HttpRouter.get(
    "/api/system/jobs",
    authedRouteResponse(
      Effect.flatMap(BackgroundJobStatusService, (service) =>
        service.getSnapshot().pipe(Effect.map((snapshot) => snapshot.jobs)),
      ),
      schemaJsonResponse(Schema.Array(BackgroundJobStatusSchema)),
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
          excludeTaskKeys: ["media_scan_folder", "library_import"],
        });
      }),
      schemaJsonResponse(Schema.Array(OperationTaskSchema)),
    ),
  ),
  HttpRouter.get(
    "/api/system/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(OperationsTaskIdParamsSchema);
        return yield* (yield* OperationsTaskReadService).getTask(params.taskId);
      }),
      schemaJsonResponse(OperationTaskSchema),
    ),
  ),
  HttpRouter.get(
    "/api/library/stats",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getLibraryStats()),
      schemaJsonResponse(LibraryStatsSchema),
    ),
  ),
  HttpRouter.get(
    "/api/library/activity",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getActivity()),
      schemaJsonResponse(Schema.Array(ActivityItemSchema)),
    ),
  ),
);
