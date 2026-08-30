import { HttpRouter } from "@effect/platform";
import { Effect, Option, Schema } from "effect";
import {
  AsyncOperationAcceptedSchema,
  BrowseResultSchema,
  ImportCandidateSelectionResultSchema,
  OperationTaskSchema,
  ScanResultSchema,
  ScannerStateSchema,
} from "@packages/shared/index.ts";

import { LibraryBrowseService } from "@/features/operations/library/library-browse-service.ts";
import { CatalogLibraryWriteService } from "@/features/operations/catalog/catalog-library-write-service.ts";
import { OperationsNotFoundError } from "@/features/operations/errors.ts";
import { ImportPathScanService } from "@/features/operations/import-scan/import-path-scan-service.ts";
import { UnmappedControlService } from "@/features/operations/unmapped/unmapped-control-service.ts";
import { UnmappedImportService } from "@/features/operations/unmapped/unmapped-orchestration-import.ts";
import { UnmappedScanService } from "@/features/operations/unmapped/unmapped-scan-service.ts";
import {
  BulkControlUnmappedFoldersBodySchema,
  BrowseQuerySchema,
  ControlUnmappedFolderBodySchema,
  ImportCandidateSelectionBodySchema,
  ImportFilesBodySchema,
  ImportUnmappedFolderBodySchema,
  ScanImportPathBodySchema,
  toLibraryImportFileInputs,
} from "@/http/operations/request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  decodeQueryWithLabel,
  schemaAcceptedResponse,
  schemaJsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";
import {
  decodeOperationsTaskQuery,
  OperationsTaskReadService,
} from "@/features/operations/tasks/operations-task-service.ts";
import {
  OperationsTaskIdParamsSchema,
  OperationsTaskQuerySchema,
} from "@/features/media/request-schemas.ts";

const acceptedOperationResponse = schemaAcceptedResponse(AsyncOperationAcceptedSchema);

export const libraryRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/library/unmapped",
    authedRouteResponse(
      Effect.flatMap(UnmappedScanService, (service) => service.getUnmappedFolders()),
      schemaJsonResponse(ScannerStateSchema),
    ),
  ),
  HttpRouter.get(
    "/library/browse",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(BrowseQuerySchema, "library browse");
        const result = yield* (yield* LibraryBrowseService).browse({
          ...(query.limit === undefined ? {} : { limit: query.limit }),
          ...(query.offset === undefined ? {} : { offset: query.offset }),
          ...(query.path === undefined ? {} : { path: query.path }),
        });

        return { ...result, entries: [...result.entries] };
      }),
      schemaJsonResponse(BrowseResultSchema),
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/scan",
    authedRouteResponse(
      Effect.flatMap(UnmappedScanService, (service) => service.startUnmappedScan()),
      acceptedOperationResponse,
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
          media_id: body.media_id,
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
            ...(body.media_id === undefined ? {} : { mediaId: body.media_id }),
            ...(body.limit === undefined ? {} : { limit: body.limit }),
            path: body.path,
          }),
        );
      }),
      schemaJsonResponse(ScanResultSchema),
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

        return yield* (yield* ImportPathScanService).applyImportCandidateSelection({
          candidate_id: body.candidate_id,
          candidate_title: body.candidate_title,
          ...(body.force_select === undefined ? {} : { force_select: body.force_select }),
          files: body.files,
          selected_candidate_ids: body.selected_candidate_ids,
          selected_files: body.selected_files,
        });
      }),
      schemaJsonResponse(ImportCandidateSelectionResultSchema),
    ),
  ),
  HttpRouter.post(
    "/library/import",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ImportFilesBodySchema, "import files");

        return yield* (yield* CatalogLibraryWriteService).startLibraryImport(
          toLibraryImportFileInputs(body),
        );
      }),
      acceptedOperationResponse,
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
          ...(decoded.mediaId === undefined ? {} : { mediaId: decoded.mediaId }),
          ...(decoded.limit === undefined ? {} : { limit: decoded.limit }),
          ...(decoded.offset === undefined ? {} : { offset: decoded.offset }),
          taskKey: "library_import",
        });
      }),
      schemaJsonResponse(Schema.Array(OperationTaskSchema)),
    ),
  ),
  HttpRouter.get(
    "/library/import/tasks/:taskId",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(OperationsTaskIdParamsSchema);
        const task = yield* (yield* OperationsTaskReadService).getTaskForTaskKey({
          taskId: params.taskId,
          taskKey: "library_import",
        });

        if (Option.isNone(task)) {
          return yield* new OperationsNotFoundError({
            message: `Library import task ${params.taskId} not found`,
          });
        }

        return task.value;
      }),
      schemaJsonResponse(OperationTaskSchema),
    ),
  ),
);
