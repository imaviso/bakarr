import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { LibraryBrowseService } from "@/features/operations/library-browse-service.ts";
import { CatalogLibraryWriteService } from "@/features/operations/catalog-library-write-service.ts";
import { ImportPathScanService } from "@/features/operations/import-path-scan-service.ts";
import { UnmappedControlService } from "@/features/operations/unmapped-control-service.ts";
import { UnmappedImportService } from "@/features/operations/unmapped-orchestration-import.ts";
import { UnmappedScanService } from "@/features/operations/unmapped-scan-service.ts";
import {
  BulkControlUnmappedFoldersBodySchema,
  BrowseQuerySchema,
  ControlUnmappedFolderBodySchema,
  ImportFilesBodySchema,
  ImportUnmappedFolderBodySchema,
  ScanImportPathBodySchema,
} from "@/http/operations-request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "@/http/router-helpers.ts";

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
      Effect.flatMap(UnmappedScanService, (service) => service.runUnmappedScan()),
      successResponse,
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
    "/library/import",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ImportFilesBodySchema, "import files");
        return yield* (yield* CatalogLibraryWriteService).importFiles(
          body.files.map((file) =>
            Object.assign(
              { anime_id: file.anime_id, episode_number: file.episode_number },
              file.episode_numbers === undefined ? {} : { episode_numbers: file.episode_numbers },
              file.season === undefined ? {} : { season: file.season },
              { source_path: file.source_path },
            ),
          ),
        );
      }),
      jsonResponse,
    ),
  ),
);
