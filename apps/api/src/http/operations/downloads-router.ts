import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { HttpServerResponse } from "@effect/platform";
import { CatalogDownloadCommandService } from "@/features/operations/catalog-download-command-service.ts";
import { CatalogDownloadReadService } from "@/features/operations/catalog-download-read-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/operations-task-launcher-service.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";
import {
  DeleteDownloadQuerySchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
  toDownloadEventsExportQueryParams,
  toDownloadEventsQueryParams,
} from "@/http/operations/request-schemas.ts";
import {
  acceptedResponse,
  authedRouteResponse,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";

const commandRoute = <E, R>(
  action: (
    service: typeof CatalogDownloadCommandService.Service,
    id: number,
  ) => Effect.Effect<void, E, R>,
) =>
  authedRouteResponse(
    Effect.gen(function* () {
      const params = yield* decodePathParams(IdParamsSchema);
      const service = yield* CatalogDownloadCommandService;
      yield* action(service, params.id);
    }),
    successResponse,
  );

export const downloadsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/downloads/queue",
    authedRouteResponse(
      Effect.flatMap(CatalogDownloadReadService, (service) => service.listDownloadQueue()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/history",
    authedRouteResponse(
      Effect.flatMap(CatalogDownloadReadService, (service) =>
        service.listDownloadHistory().pipe(Effect.map((page) => page.downloads)),
      ),
      jsonResponse,
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
      jsonResponse,
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
    commandRoute((service, id) => service.pauseDownload(id)),
  ),
  HttpRouter.post(
    "/downloads/:id/resume",
    commandRoute((service, id) => service.resumeDownload(id)),
  ),
  HttpRouter.post(
    "/downloads/:id/retry",
    commandRoute((service, id) => service.retryDownload(id)),
  ),
  HttpRouter.post(
    "/downloads/:id/reconcile",
    commandRoute((service, id) => service.reconcileDownload(id)),
  ),
  HttpRouter.post(
    "/downloads/sync",
    authedRouteResponse(
      Effect.gen(function* () {
        const service = yield* CatalogDownloadCommandService;
        return yield* (yield* OperationsTaskLauncherService).launch({
          failureMessage: "Manual download sync failed",
          operation: () => service.syncDownloads(),
          queuedMessage: "Queued manual download sync",
          runningMessage: "Running manual download sync",
          successMessage: () => "Manual download sync finished",
          taskKey: "downloads_sync_manual",
        });
      }),
      acceptedResponse,
    ),
  ),
  HttpRouter.del(
    "/downloads/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQueryWithLabel(DeleteDownloadQuerySchema, "delete download");
        yield* (yield* CatalogDownloadCommandService).removeDownload(
          params.id,
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
