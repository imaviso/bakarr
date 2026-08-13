import { HttpRouter } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  AsyncOperationAcceptedSchema,
  DownloadEventsPageSchema,
  DownloadSchema,
  DownloadStatusSchema,
} from "@packages/shared/index.ts";

import { CatalogDownloadReadService } from "@/features/operations/catalog/catalog-download-read-service.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";
import { DownloadTorrentActionService } from "@/features/operations/download/download-torrent-action-service.ts";
import { DownloadTorrentSyncService } from "@/features/operations/download/download-torrent-sync-service.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";
import { buildExportHeaders, buildExportStreamResponse } from "@/http/shared/export-responses.ts";
import {
  DeleteDownloadQuerySchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
  toDownloadEventsExportQueryParams,
  toDownloadEventsQueryParams,
} from "@/http/operations/request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQueryWithLabel,
  schemaAcceptedResponse,
  schemaJsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";

export const downloadsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/downloads/queue",
    authedRouteResponse(
      Effect.flatMap(CatalogDownloadReadService, (service) => service.listDownloadQueue()),
      schemaJsonResponse(Schema.Array(DownloadStatusSchema)),
    ),
  ),
  HttpRouter.get(
    "/downloads/history",
    authedRouteResponse(
      Effect.flatMap(CatalogDownloadReadService, (service) => service.listDownloadHistory()),
      schemaJsonResponse(Schema.Array(DownloadSchema)),
    ),
  ),
  HttpRouter.get(
    "/downloads/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(DownloadEventsQuerySchema, "download events");
        return yield* (yield* CatalogDownloadReadService).listDownloadEvents(
          toDownloadEventsQueryParams(query),
        );
      }),
      schemaJsonResponse(DownloadEventsPageSchema),
    ),
  ),
  HttpRouter.get(
    "/downloads/events/export",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(
          DownloadEventsExportQuerySchema,
          "download events export",
        );
        const service = yield* CatalogDownloadReadService;
        const input = toDownloadEventsExportQueryParams(query);

        if ((query.format ?? "json") === "csv") {
          const streamed = yield* service.streamDownloadEventsExportCsv(input);
          const result: {
            format: "csv";
            header: typeof streamed.header;
            stream: typeof streamed.stream;
          } = {
            format: "csv",
            header: streamed.header,
            stream: streamed.stream,
          };
          return result;
        }

        const streamed = yield* service.streamDownloadEventsExportJson(input);
        const result: {
          format: "json";
          header: typeof streamed.header;
          stream: typeof streamed.stream;
        } = {
          format: "json",
          header: streamed.header,
          stream: streamed.stream,
        };
        return result;
      }),
      (result) =>
        buildExportStreamResponse(
          result.format,
          result.stream,
          result.format === "csv" ? "bakarr-download-events.csv" : "bakarr-download-events.json",
          buildExportHeaders(result.header, "events"),
        ),
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/pause",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadTorrentActionService).applyDownloadActionEffect(params.id, "pause");
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/resume",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadTorrentActionService).applyDownloadActionEffect(params.id, "resume");
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/retry",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadTorrentActionService).retryDownloadById(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/reconcile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadReconciliationService).reconcileDownloadByIdEffect(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/sync",
    authedRouteResponse(
      Effect.flatMap(DownloadTorrentSyncService, (service) => service.startDownloadSync()),
      schemaAcceptedResponse(AsyncOperationAcceptedSchema),
    ),
  ),
  HttpRouter.del(
    "/downloads/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQueryWithLabel(DeleteDownloadQuerySchema, "delete download");
        yield* (yield* DownloadTorrentActionService).applyDownloadActionEffect(
          params.id,
          "delete",
          query.delete_files === "true",
        );
      }),
      successResponse,
    ),
  ),
);
