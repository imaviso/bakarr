import { HttpRouter } from "@effect/platform";
import { Effect, Schema } from "effect";

import { MediaFileService } from "@/features/media/files/media-file-service.ts";
import { MediaEnrollmentService } from "@/features/media/add/media-enrollment-service.ts";
import { MediaMaintenanceService } from "@/features/media/metadata/media-maintenance-service.ts";
import { MediaSettingsService } from "@/features/media/shared/media-settings-service.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { OperationsTaskReadService } from "@/features/operations/tasks/operations-task-service.ts";
import { CatalogLibraryWriteService } from "@/features/operations/catalog/catalog-library-write-service.ts";
import {
  AsyncOperationAcceptedSchema,
  brandMediaId,
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
        const animeMaintenanceService = yield* MediaMaintenanceService;
        return yield* (yield* OperationsTaskLauncherService).launch({
          mediaId: params.id,
          failureMessage: `MediaUnit metadata refresh failed for media ${params.id}`,
          operation: () => animeMaintenanceService.refreshEpisodes(params.id),
          queuedMessage: `Queued episode metadata refresh for media ${params.id}`,
          runningMessage: `Refreshing episode metadata for media ${params.id}`,
          successMessage: () => `Finished episode metadata refresh for media ${params.id}`,
          taskKey: "media_refresh_units_manual",
        });
      }),
      acceptedOperationResponse,
    ),
  ),
  HttpRouter.post(
    "/media/:id/units/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const animeFileService = yield* MediaFileService;
        return yield* (yield* OperationsTaskLauncherService).launch({
          mediaId: params.id,
          failureMessage: `Folder scan failed for media ${params.id}`,
          operation: () => animeFileService.scanFolder(params.id),
          queuedMessage: `Queued folder scan for media ${params.id}`,
          runningMessage: `Scanning folder for media ${params.id}`,
          successMessage: (result: { readonly found: number; readonly total: number }) =>
            `Folder scan completed for media ${params.id}: found ${result.found} files`,
          successProgress: (result: { readonly found: number; readonly total: number }) => ({
            progressCurrent: result.found,
            progressTotal: result.total,
          }),
          successPayload: (result: { readonly found: number; readonly total: number }) => ({
            media_id: brandMediaId(params.id),
            found: result.found,
            total: result.total,
          }),
          failurePayload: () => ({
            media_id: brandMediaId(params.id),
          }),
          taskKey: "media_scan_folder",
        });
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
        const task = yield* (yield* OperationsTaskReadService).getTask(params.taskId);

        if (task.task_key !== "media_scan_folder") {
          return yield* new MediaNotFoundError({
            message: `Media scan task ${params.taskId} not found`,
          });
        }

        if (task.media_id !== undefined && task.media_id !== params.id) {
          return yield* new MediaNotFoundError({
            message: `Media scan task ${params.taskId} not found`,
          });
        }

        return task;
      }),
      schemaJsonResponse(OperationTaskSchema),
    ),
  ),
  HttpRouter.del(
    "/media/:id/units/:unitNumber/file",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaUnitParamsSchema);
        yield* (yield* MediaFileService).deleteEpisodeFile(params.id, params.unitNumber);
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
        yield* (yield* MediaFileService).mapEpisodeFile(
          params.id,
          params.unitNumber,
          body.file_path,
        );
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
        yield* (yield* MediaFileService).bulkMapEpisodeFiles(params.id, [...body.mappings]);
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
