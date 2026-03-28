import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { LibraryBrowseService } from "../features/operations/library-browse-service.ts";
import { CatalogLibraryService } from "../features/operations/catalog-service-tags.ts";
import {
  ImportPathScanService,
  UnmappedFolderService,
} from "../features/operations/search-service-tags.ts";
import {
  BulkControlUnmappedFoldersBodySchema,
  BrowseQuerySchema,
  ControlUnmappedFolderBodySchema,
  ImportFilesBodySchema,
  ImportUnmappedFolderBodySchema,
  ScanImportPathBodySchema,
} from "./operations-request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "./router-helpers.ts";

export const libraryRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/library/unmapped",
    authedRouteResponse(
      Effect.flatMap(UnmappedFolderService, (service) => service.getUnmappedFolders()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/library/browse",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(BrowseQuerySchema, "library browse");
        return yield* (yield* LibraryBrowseService).browse({
          limit: query.limit,
          offset: query.offset,
          path: query.path,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/scan",
    authedRouteResponse(
      Effect.flatMap(UnmappedFolderService, (service) => service.runUnmappedScan()),
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
        yield* (yield* UnmappedFolderService).controlUnmappedFolder(body);
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
        yield* (yield* UnmappedFolderService).bulkControlUnmappedFolders(body);
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
        yield* (yield* UnmappedFolderService).importUnmappedFolder(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ScanImportPathBodySchema, "scan import path");
        return yield* (yield* ImportPathScanService).scanImportPath(body.path, body.anime_id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ImportFilesBodySchema, "import files");
        return yield* (yield* CatalogLibraryService).importFiles(body.files);
      }),
      jsonResponse,
    ),
  ),
);
