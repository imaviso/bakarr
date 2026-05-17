import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeFileService } from "@/features/media/files/media-file-service.ts";
import { AnimeEnrollmentService } from "@/features/media/add/media-enrollment-service.ts";
import { AnimeMaintenanceService } from "@/features/media/metadata/media-maintenance-service.ts";
import { AnimeSettingsService } from "@/features/media/shared/media-settings-service.ts";
import { OperationsTaskNotFoundError } from "@/features/operations/errors.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { OperationsTaskReadService } from "@/features/operations/tasks/operations-task-service.ts";
import { CatalogLibraryWriteService } from "@/features/operations/catalog/catalog-library-write-service.ts";
import { brandMediaId } from "@packages/shared/index.ts";
import {
  AddAnimeInputSchema,
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
  acceptedResponse,
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  jsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";

export const animeWriteRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/media",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddAnimeInputSchema, "add media");
        return yield* (yield* AnimeEnrollmentService).enroll(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/media/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* AnimeMaintenanceService).deleteMedia(params.id);
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
        yield* (yield* AnimeSettingsService).setMonitored(params.id, body.monitored);
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
        yield* (yield* AnimeSettingsService).updatePath(params.id, body.path);
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
        yield* (yield* AnimeSettingsService).updateProfile(params.id, body.profile_name);
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
        yield* (yield* AnimeSettingsService).updateReleaseProfiles(params.id, [
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
        const animeMaintenanceService = yield* AnimeMaintenanceService;
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
      acceptedResponse,
    ),
  ),
  HttpRouter.post(
    "/media/:id/units/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const animeFileService = yield* AnimeFileService;
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
      acceptedResponse,
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
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/:id/units/scan/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaOperationsTaskIdParamsSchema);
        const task = yield* (yield* OperationsTaskReadService).getTask(params.taskId);

        if (task.task_key !== "media_scan_folder") {
          return yield* new OperationsTaskNotFoundError({
            message: `Media scan task ${params.taskId} not found`,
          });
        }

        if (task.media_id !== undefined && task.media_id !== params.id) {
          return yield* new OperationsTaskNotFoundError({
            message: `Media scan task ${params.taskId} not found`,
          });
        }

        return task;
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/media/:id/units/:unitNumber/file",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaUnitParamsSchema);
        yield* (yield* AnimeFileService).deleteEpisodeFile(params.id, params.unitNumber);
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
        yield* (yield* AnimeFileService).mapEpisodeFile(
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
        yield* (yield* AnimeFileService).bulkMapEpisodeFiles(params.id, [...body.mappings]);
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
      jsonResponse,
    ),
  ),
);
