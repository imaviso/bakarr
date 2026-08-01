import { HttpRouter } from "@effect/platform";
import { Effect, Option, Schema } from "effect";

import { MediaFileService } from "@/features/media/files/media-file-service.ts";
import { MediaEnrollmentService } from "@/features/media/add/media-enrollment-service.ts";
import { MediaMaintenanceService } from "@/features/media/metadata/media-maintenance-service.ts";
import { MediaSettingsService } from "@/features/media/shared/media-settings-service.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { OperationsTaskReadService } from "@/features/operations/tasks/operations-task-service.ts";
import { CatalogLibraryWriteService } from "@/features/operations/catalog/catalog-library-write-service.ts";
import {
  AsyncOperationAcceptedSchema,
  MediaSchema,
  OperationTaskSchema,
  RenameResultSchema,
} from "@packages/shared/index.ts";
import {
  AddMediaInputSchema,
  MediaUnitParamsSchema,
  BulkUnitMappingsBodySchema,
  FilePathBodySchema,
  MediaOperationsTaskIdParamsSchema,
  MonitoredBodySchema,
  PathBodySchema,
  ProfileNameBodySchema,
  ReleaseProfileIdsBodySchema,
} from "@/http/media/request-schemas.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  schemaAcceptedResponse,
  schemaJsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";

const acceptedOperationResponse = schemaAcceptedResponse(AsyncOperationAcceptedSchema);

export const mediaWriteRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/media",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddMediaInputSchema, "add media");
        return yield* (yield* MediaEnrollmentService).enroll(body);
      }),
      schemaJsonResponse(MediaSchema),
    ),
  ),
  HttpRouter.del(
    "/media/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* MediaMaintenanceService).deleteMedia(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/media/:id/monitor",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(MonitoredBodySchema, "update monitored status");
        yield* (yield* MediaSettingsService).setMonitored(params.id, body.monitored);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/media/:id/path",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(PathBodySchema, "update media path");
        yield* (yield* MediaSettingsService).updatePath(params.id, body.path);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/media/:id/profile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(ProfileNameBodySchema, "update media profile");
        yield* (yield* MediaSettingsService).updateProfile(params.id, body.profile_name);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/media/:id/release-profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(
          ReleaseProfileIdsBodySchema,
          "update release profiles",
        );
        yield* (yield* MediaSettingsService).updateReleaseProfiles(params.id, [
          ...body.release_profile_ids,
        ]);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/media/:id/units/refresh",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* MediaMaintenanceService).startUnitsRefresh(params.id);
      }),
      acceptedOperationResponse,
    ),
  ),
  HttpRouter.post(
    "/media/:id/units/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* MediaFileService).startMediaFolderScan(params.id);
      }),
      acceptedOperationResponse,
    ),
  ),
  HttpRouter.get(
    "/media/:id/units/scan/tasks",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* OperationsTaskReadService).listTasks({
          mediaId: params.id,
          taskKey: "media_scan_folder",
        });
      }),
      schemaJsonResponse(Schema.Array(OperationTaskSchema)),
    ),
  ),
  HttpRouter.get(
    "/media/:id/units/scan/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaOperationsTaskIdParamsSchema);
        const task = yield* (yield* OperationsTaskReadService).getTaskForTaskKey({
          mediaId: params.id,
          taskId: params.taskId,
          taskKey: "media_scan_folder",
        });

        if (Option.isNone(task)) {
          return yield* new MediaNotFoundError({
            message: `Media scan task ${params.taskId} not found`,
          });
        }

        return task.value;
      }),
      schemaJsonResponse(OperationTaskSchema),
    ),
  ),
  HttpRouter.del(
    "/media/:id/units/:unitNumber/file",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaUnitParamsSchema);
        yield* (yield* MediaFileService).deleteUnitFile(params.id, params.unitNumber);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/media/:id/units/:unitNumber/map",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaUnitParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(FilePathBodySchema, "map episode file");
        yield* (yield* MediaFileService).mapUnitFile(params.id, params.unitNumber, body.file_path);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/media/:id/units/map/bulk",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(
          BulkUnitMappingsBodySchema,
          "bulk map mediaUnits",
        );
        yield* (yield* MediaFileService).bulkMapUnitFiles(params.id, [...body.mappings]);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/media/:id/rename",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogLibraryWriteService).renameFiles(params.id);
      }),
      schemaJsonResponse(RenameResultSchema),
    ),
  ),
);
