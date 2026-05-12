import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeFileService } from "@/features/anime/anime-file-service.ts";
import { AnimeEnrollmentService } from "@/features/anime/anime-enrollment-service.ts";
import { AnimeMaintenanceService } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeSettingsService } from "@/features/anime/anime-settings-service.ts";
import { OperationsTaskNotFoundError } from "@/features/operations/errors.ts";
import { OperationsTaskLauncherService } from "@/features/operations/operations-task-launcher-service.ts";
import { OperationsTaskReadService } from "@/features/operations/operations-task-service.ts";
import { CatalogLibraryWriteService } from "@/features/operations/catalog-library-write-service.ts";
import {
  AddAnimeInputSchema,
  AnimeEpisodeParamsSchema,
  BulkEpisodeMappingsBodySchema,
  FilePathBodySchema,
  AnimeOperationsTaskIdParamsSchema,
  MonitoredBodySchema,
  PathBodySchema,
  ProfileNameBodySchema,
  ReleaseProfileIdsBodySchema,
} from "@/http/anime/request-schemas.ts";
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
    "/anime",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddAnimeInputSchema, "add anime");
        return yield* (yield* AnimeEnrollmentService).enroll(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/anime/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* AnimeMaintenanceService).deleteAnime(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/monitor",
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
    "/anime/:id/path",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(PathBodySchema, "update anime path");
        yield* (yield* AnimeSettingsService).updatePath(params.id, body.path);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/profile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(ProfileNameBodySchema, "update anime profile");
        yield* (yield* AnimeSettingsService).updateProfile(params.id, body.profile_name);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/release-profiles",
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
    "/anime/:id/episodes/refresh",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const animeMaintenanceService = yield* AnimeMaintenanceService;
        return yield* (yield* OperationsTaskLauncherService).launch({
          animeId: params.id,
          failureMessage: `Episode metadata refresh failed for anime ${params.id}`,
          operation: () => animeMaintenanceService.refreshEpisodes(params.id),
          queuedMessage: `Queued episode metadata refresh for anime ${params.id}`,
          runningMessage: `Refreshing episode metadata for anime ${params.id}`,
          successMessage: () => `Finished episode metadata refresh for anime ${params.id}`,
          taskKey: "anime_refresh_episodes_manual",
        });
      }),
      acceptedResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const animeFileService = yield* AnimeFileService;
        return yield* (yield* OperationsTaskLauncherService).launch({
          animeId: params.id,
          failureMessage: `Folder scan failed for anime ${params.id}`,
          operation: () => animeFileService.scanFolder(params.id),
          queuedMessage: `Queued folder scan for anime ${params.id}`,
          runningMessage: `Scanning folder for anime ${params.id}`,
          successMessage: (result: { readonly found: number; readonly total: number }) =>
            `Folder scan completed for anime ${params.id}: found ${result.found} files`,
          successProgress: (result: { readonly found: number; readonly total: number }) => ({
            progressCurrent: result.found,
            progressTotal: result.total,
          }),
          successPayload: (result: { readonly found: number; readonly total: number }) => ({
            anime_id: params.id,
            found: result.found,
            total: result.total,
          }),
          failurePayload: () => ({
            anime_id: params.id,
          }),
          taskKey: "anime_scan_folder",
        });
      }),
      acceptedResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/episodes/scan/tasks",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* OperationsTaskReadService).listTasks({
          animeId: params.id,
          taskKey: "anime_scan_folder",
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/episodes/scan/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeOperationsTaskIdParamsSchema);
        const task = yield* (yield* OperationsTaskReadService).getTask(params.taskId);

        if (task.task_key !== "anime_scan_folder") {
          return yield* new OperationsTaskNotFoundError({
            message: `Anime scan task ${params.taskId} not found`,
          });
        }

        if (task.anime_id !== undefined && task.anime_id !== params.id) {
          return yield* new OperationsTaskNotFoundError({
            message: `Anime scan task ${params.taskId} not found`,
          });
        }

        return task;
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/anime/:id/episodes/:episodeNumber/file",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        yield* (yield* AnimeFileService).deleteEpisodeFile(params.id, params.episodeNumber);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/:episodeNumber/map",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(FilePathBodySchema, "map episode file");
        yield* (yield* AnimeFileService).mapEpisodeFile(
          params.id,
          params.episodeNumber,
          body.file_path,
        );
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/map/bulk",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(
          BulkEpisodeMappingsBodySchema,
          "bulk map episodes",
        );
        yield* (yield* AnimeFileService).bulkMapEpisodeFiles(params.id, [...body.mappings]);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/rename",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogLibraryWriteService).renameFiles(params.id);
      }),
      jsonResponse,
    ),
  ),
);
