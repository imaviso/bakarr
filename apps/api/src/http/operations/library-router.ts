import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { LibraryBrowseService } from "@/features/operations/library/library-browse-service.ts";
import { CatalogLibraryWriteService } from "@/features/operations/catalog/catalog-library-write-service.ts";
import { OperationsTaskNotFoundError } from "@/features/operations/errors.ts";
import { ImportPathScanService } from "@/features/operations/import-scan/import-path-scan-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { UnmappedControlService } from "@/features/operations/unmapped/unmapped-control-service.ts";
import { UnmappedImportService } from "@/features/operations/unmapped/unmapped-orchestration-import.ts";
import { UnmappedScanService } from "@/features/operations/unmapped/unmapped-scan-service.ts";
import { applyImportCandidateSelection } from "@/features/operations/import-scan/import-selection-support.ts";
import {
  BulkControlUnmappedFoldersBodySchema,
  BrowseQuerySchema,
  ControlUnmappedFolderBodySchema,
  ImportCandidateSelectionBodySchema,
  ImportFilesBodySchema,
  ImportUnmappedFolderBodySchema,
  ScanImportPathBodySchema,
} from "@/http/operations/request-schemas.ts";
import {
  acceptedResponse,
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";
import {
  decodeOperationsTaskQuery,
  OperationsTaskReadService,
  OperationsTaskWriteService,
} from "@/features/operations/tasks/operations-task-service.ts";
import {
  OperationsTaskIdParamsSchema,
  OperationsTaskQuerySchema,
} from "@/http/anime/request-schemas.ts";

export const libraryRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/library/unmapped",
    authedRouteResponse(
      Effect.flatMap(UnmappedScanService, (service) => service.getUnmappedFolders()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/library/browse",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(BrowseQuerySchema, "library browse");
        return yield* (yield* LibraryBrowseService).browse({
          ...(query.limit === undefined ? {} : { limit: query.limit }),
          ...(query.offset === undefined ? {} : { offset: query.offset }),
          ...(query.path === undefined ? {} : { path: query.path }),
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const service = yield* UnmappedScanService;
        return yield* (yield* OperationsTaskLauncherService).launch({
          failureMessage: "Manual unmapped-folder scan failed",
          operation: () => service.runUnmappedScan(),
          queuedMessage: "Queued manual unmapped-folder scan",
          runningMessage: "Running manual unmapped-folder scan",
          successMessage: (result: { readonly folderCount: number }) =>
            `Manual unmapped-folder scan finished (${result.folderCount} folder(s))`,
          successProgress: (result: { readonly folderCount: number }) => ({
            progressCurrent: result.folderCount,
            progressTotal: result.folderCount,
          }),
          taskKey: "unmapped_scan_manual",
        });
      }),
      acceptedResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/control",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(
          ControlUnmappedFolderBodySchema,
          "control unmapped folder",
        );
        yield* (yield* UnmappedControlService).controlUnmappedFolder(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/control/bulk",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(
          BulkControlUnmappedFoldersBodySchema,
          "bulk control unmapped folders",
        );
        yield* (yield* UnmappedControlService).bulkControlUnmappedFolders(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/import",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(
          ImportUnmappedFolderBodySchema,
          "import unmapped folder",
        );
        yield* (yield* UnmappedImportService).importUnmappedFolder({
          anime_id: body.anime_id,
          folder_name: body.folder_name,
          ...(body.profile_name === undefined ? {} : { profile_name: body.profile_name }),
        });
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ScanImportPathBodySchema, "scan import path");
        return yield* Effect.flatMap(ImportPathScanService, (service) =>
          service.scanImportPath({
            ...(body.anime_id === undefined ? {} : { animeId: body.anime_id }),
            ...(body.limit === undefined ? {} : { limit: body.limit }),
            path: body.path,
          }),
        );
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import/selection",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(
          ImportCandidateSelectionBodySchema,
          "build import selection",
        );

        return applyImportCandidateSelection({
          candidate_id: body.candidate_id,
          candidate_title: body.candidate_title,
          ...(body.force_select === undefined ? {} : { force_select: body.force_select }),
          files: body.files,
          selected_candidate_ids: body.selected_candidate_ids,
          selected_files: body.selected_files,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ImportFilesBodySchema, "import files");
        const files = body.files.map((file) =>
          Object.assign(
            { anime_id: file.anime_id, episode_number: file.episode_number },
            file.episode_numbers === undefined ? {} : { episode_numbers: file.episode_numbers },
            file.season === undefined ? {} : { season: file.season },
            { source_path: file.source_path },
          ),
        );
        const animeId = files[0]?.anime_id;

        const taskLauncher = yield* OperationsTaskLauncherService;
        const catalogLibraryWrite = yield* CatalogLibraryWriteService;
        const operationsTaskService = yield* OperationsTaskWriteService;

        return yield* taskLauncher.launch({
          ...(animeId === undefined ? {} : { animeId }),
          failureMessage: `Library import failed for ${files.length} file(s)`,
          operation: (taskId) =>
            Effect.gen(function* () {
              const result = yield* catalogLibraryWrite.importFiles(files);
              yield* operationsTaskService.updateTaskProgress({
                message: `Imported ${result.imported} file(s), ${result.failed} failed`,
                progressCurrent: result.imported + result.failed,
                progressTotal: result.imported + result.failed,
                taskId,
              });
              return result;
            }),
          queuedMessage: `Queued library import for ${files.length} file(s)`,
          runningMessage: `Importing ${files.length} file(s) into library`,
          successMessage: (result: { readonly imported: number; readonly failed: number }) =>
            `Library import finished (${result.imported} imported, ${result.failed} failed)`,
          successProgress: (result: { readonly imported: number; readonly failed: number }) => ({
            progressCurrent: result.imported + result.failed,
            progressTotal: result.imported + result.failed,
          }),
          successPayload: (result: { readonly imported: number; readonly failed: number }) => ({
            ...(animeId === undefined ? {} : { anime_id: animeId }),
            failed: result.failed,
            imported: result.imported,
            total: result.imported + result.failed,
          }),
          failurePayload: () => ({
            ...(animeId === undefined ? {} : { anime_id: animeId }),
            failed: files.length,
            total: files.length,
          }),
          taskKey: "library_import",
        });
      }),
      acceptedResponse,
    ),
  ),
  HttpRouter.get(
    "/library/import/tasks",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(
          OperationsTaskQuerySchema,
          "library import tasks",
        );
        const decoded = yield* decodeOperationsTaskQuery(query);

        return yield* (yield* OperationsTaskReadService).listTasks({
          ...(decoded.animeId === undefined ? {} : { animeId: decoded.animeId }),
          ...(decoded.limit === undefined ? {} : { limit: decoded.limit }),
          ...(decoded.offset === undefined ? {} : { offset: decoded.offset }),
          taskKey: "library_import",
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/library/import/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(OperationsTaskIdParamsSchema);
        const task = yield* (yield* OperationsTaskReadService).getTask(params.taskId);

        if (task.task_key !== "library_import") {
          return yield* new OperationsTaskNotFoundError({
            message: `Library import task ${params.taskId} not found`,
          });
        }

        return task;
      }),
      jsonResponse,
    ),
  ),
);
