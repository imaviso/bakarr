import { HttpRouter } from "effect/unstable/http";
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

export const infoRoutes = [
  HttpRouter.route(
    "GET",
    "/api/system/observability",
    authedRouteResponse(
      Effect.gen(function* () {
        return makeObservabilityStatus(yield* ObservabilityConfig);
      }),
      schemaJsonResponse(ObservabilityStatusSchema),
    ),
  ),
  HttpRouter.route(
    "GET",
    "/api/system/dashboard",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getDashboard()),
      schemaJsonResponse(OpsDashboardSchema),
    ),
  ),
  HttpRouter.route(
    "GET",
    "/api/system/jobs",
    authedRouteResponse(
      Effect.flatMap(BackgroundJobStatusService, (service) =>
        service.getSnapshot().pipe(Effect.map((snapshot) => snapshot.jobs)),
      ),
      schemaJsonResponse(Schema.Array(BackgroundJobStatusSchema)),
    ),
  ),
  HttpRouter.route(
    "GET",
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
  HttpRouter.route(
    "GET",
    "/api/system/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(OperationsTaskIdParamsSchema);
        return yield* (yield* OperationsTaskReadService).getTask(params.taskId);
      }),
      schemaJsonResponse(OperationTaskSchema),
    ),
  ),
  HttpRouter.route(
    "GET",
    "/api/library/stats",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getLibraryStats()),
      schemaJsonResponse(LibraryStatsSchema),
    ),
  ),
  HttpRouter.route(
    "GET",
    "/api/library/activity",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getActivity()),
      schemaJsonResponse(Schema.Array(ActivityItemSchema)),
    ),
  ),
];
