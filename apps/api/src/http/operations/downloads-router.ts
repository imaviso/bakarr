import { HttpRouter } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  AsyncOperationAcceptedSchema,
  DownloadEventsPageSchema,
  DownloadSchema,
  DownloadStatusSchema,
} from "@packages/shared/index.ts";

import { HttpServerResponse } from "@effect/platform";
import { CatalogDownloadReadService } from "@/features/operations/catalog/catalog-download-read-service.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";
import { DownloadTorrentActionService } from "@/features/operations/download/download-torrent-action-service.ts";
import { DownloadTorrentSyncService } from "@/features/operations/download/download-torrent-sync-service.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";
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
      Effect.flatMap(OperationsProgress, (service) => service.getDownloadProgress()),
      schemaJsonResponse(Schema.Array(DownloadStatusSchema)),
    ),
  ),
  HttpRouter.get(
    "/downloads/history",
    authedRouteResponse(
      Effect.flatMap(DownloadRepository, (repo) =>
        repo.listDownloadHistory().pipe(Effect.map((page) => page.downloads)),
      ),
      schemaJsonResponse(Schema.Array(DownloadSchema)),
    ),
  ),
  HttpRouter.get(
    "/downloads/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(DownloadEventsQuerySchema, "download events");
        return yield* (yield* DownloadRepository).listDownloadEvents(
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
          return {
            format: "csv" as const,
            header: streamed.header,
            stream: streamed.stream,
          };
        }

        const streamed = yield* service.streamDownloadEventsExportJson(input);

        return {
          format: "json" as const,
          header: streamed.header,
          stream: streamed.stream,
        };
      }),
      (result) => {
        const { format, header } = result;
        const exportHeaders = buildDownloadExportHeaders(header);

        if (format === "csv") {
          return HttpServerResponse.stream(result.stream, {
            contentType: "text/csv; charset=utf-8",
            headers: {
              ...exportHeaders,
              "Content-Disposition": `attachment; filename="bakarr-download-events.csv"`,
            },
          });
        }

        return HttpServerResponse.stream(result.stream, {
          contentType: "application/json; charset=utf-8",
          headers: {
            ...exportHeaders,
            "Content-Disposition": `attachment; filename="bakarr-download-events.json"`,
          },
        });
      },
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
      Effect.gen(function* () {
        const torrentSync = yield* DownloadTorrentSyncService;
        return yield* (yield* OperationsTaskLauncherService).launch({
          failureMessage: "Manual download sync failed",
          operation: () => torrentSync.syncDownloads(),
          queuedMessage: "Queued manual download sync",
          runningMessage: "Running manual download sync",
          successMessage: () => "Manual download sync finished",
          taskKey: "downloads_sync_manual",
        });
      }),
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

export function buildDownloadExportHeaders(header: {
  readonly exported: number;
  readonly generated_at: string;
  readonly limit: number;
  readonly order: string;
  readonly total: number;
  readonly truncated: boolean;
}) {
  return {
    "X-Bakarr-Export-Limit": String(header.limit),
    "X-Bakarr-Export-Order": header.order,
    "X-Bakarr-Export-Truncated": String(header.truncated),
    "X-Bakarr-Exported-Events": String(header.exported),
    "X-Bakarr-Generated-At": header.generated_at,
    "X-Bakarr-Total-Events": String(header.total),
  };
}
