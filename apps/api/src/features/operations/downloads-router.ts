import * as HttpRouter from "effect/unstable/http/HttpRouter";
import { Effect, Layer, Schema } from "effect";
import {
  AsyncOperationAcceptedSchema,
  DownloadEventsPageSchema,
  DownloadSchema,
  DownloadStatusSchema,
} from "@packages/shared/index.ts";

import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";
import { DownloadTorrentActionService } from "@/features/operations/download/download-torrent-action-service.ts";
import { DownloadTorrentSyncService } from "@/features/operations/download/download-torrent-sync-service.ts";
import { IdParamsSchema } from "@/infra/http/common-request-schemas.ts";
import { buildExportHeaders, buildExportStreamResponse } from "@/infra/http/export-responses.ts";
import {
  DeleteDownloadQuerySchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
  toDownloadEventsExportQueryParams,
  toDownloadEventsQueryParams,
} from "@/features/operations/request-schemas.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import {
  renderDownloadEventsExportCsv,
  renderDownloadEventsExportJson,
  type DownloadEventCsvExportStreamShape,
  type DownloadEventExportStreamShape,
} from "@/features/operations/catalog/catalog-download-event-render-support.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { nowIso } from "@/infra/time.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQueryWithLabel,
  schemaAcceptedResponse,
  schemaJsonResponse,
  successResponse,
} from "@/infra/http/router-helpers.ts";

export const downloadsRouter = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/downloads/queue",
    authedRouteResponse(
      Effect.flatMap(OperationsProgress, (progress) => progress.getDownloadProgress()),
      schemaJsonResponse(Schema.Array(DownloadStatusSchema)),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/downloads/history",
    authedRouteResponse(
      Effect.flatMap(DownloadRepository, (repository) =>
        Effect.map(repository.listDownloadHistory(), (page) => page.downloads),
      ),
      schemaJsonResponse(Schema.Array(DownloadSchema)),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/downloads/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(DownloadEventsQuerySchema, "download events");
        const repository = yield* DownloadRepository;
        return yield* repository.listDownloadEvents(toDownloadEventsQueryParams(query));
      }),
      schemaJsonResponse(DownloadEventsPageSchema),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/downloads/events/export",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(
          DownloadEventsExportQuerySchema,
          "download events export",
        );
        const repository = yield* DownloadRepository;
        const input = toDownloadEventsExportQueryParams(query);
        const generatedAt = yield* nowIso();

        if ((query.format ?? "json") === "csv") {
          const header = yield* repository.loadDownloadEventExportHeader(input, generatedAt);
          const streamed: DownloadEventCsvExportStreamShape = {
            header,
            stream: renderDownloadEventsExportCsv(repository.streamDownloadEvents(input)),
          };
          const result: { format: "csv" } & DownloadEventCsvExportStreamShape = {
            format: "csv",
            ...streamed,
          };
          return result;
        }

        const header = yield* repository.loadDownloadEventExportHeader(input, generatedAt);
        const streamed: DownloadEventExportStreamShape = {
          header,
          stream: renderDownloadEventsExportJson(repository.streamDownloadEvents(input), header),
        };
        const result: { format: "json" } & DownloadEventExportStreamShape = {
          format: "json",
          ...streamed,
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
  HttpRouter.add(
    "POST",
    "/downloads/:id/pause",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadTorrentActionService).applyDownloadActionEffect(params.id, "pause");
      }),
      successResponse,
    ),
  ),
  HttpRouter.add(
    "POST",
    "/downloads/:id/resume",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadTorrentActionService).applyDownloadActionEffect(params.id, "resume");
      }),
      successResponse,
    ),
  ),
  HttpRouter.add(
    "POST",
    "/downloads/:id/retry",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadTorrentActionService).retryDownloadById(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.add(
    "POST",
    "/downloads/:id/reconcile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadReconciliationService).reconcileDownloadByIdEffect(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.add(
    "POST",
    "/downloads/sync",
    authedRouteResponse(
      Effect.flatMap(DownloadTorrentSyncService, (service) => service.startDownloadSync()),
      schemaAcceptedResponse(AsyncOperationAcceptedSchema),
    ),
  ),
  HttpRouter.add(
    "DELETE",
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
