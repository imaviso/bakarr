import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { HttpServerResponse } from "@effect/platform";
import { CatalogDownloadCommandService } from "@/features/operations/catalog-download-command-service.ts";
import { CatalogDownloadReadService } from "@/features/operations/catalog-download-read-service.ts";
import { IdParamsSchema } from "@/http/common-request-schemas.ts";
import {
  DeleteDownloadQuerySchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
} from "@/http/operations-request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "@/http/router-helpers.ts";

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
        return yield* (yield* CatalogDownloadReadService).listDownloadEvents({
          animeId: query.anime_id,
          cursor: query.cursor,
          downloadId: query.download_id,
          direction: query.direction,
          endDate: query.end_date,
          eventType: query.event_type,
          limit: query.limit,
          startDate: query.start_date,
          status: query.status,
        });
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
        const input = {
          animeId: query.anime_id,
          downloadId: query.download_id,
          endDate: query.end_date,
          eventType: query.event_type,
          limit: query.limit,
          order: query.order,
          startDate: query.start_date,
          status: query.status,
        };

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
        const exportHeaders = {
          "X-Bakarr-Export-Limit": String(header.limit),
          "X-Bakarr-Export-Order": header.order,
          "X-Bakarr-Export-Truncated": String(header.truncated),
          "X-Bakarr-Exported-Events": String(header.exported),
          "X-Bakarr-Generated-At": header.generated_at,
          "X-Bakarr-Total-Events": String(header.total),
        };

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
        yield* (yield* CatalogDownloadCommandService).pauseDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/resume",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogDownloadCommandService).resumeDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/retry",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogDownloadCommandService).retryDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/reconcile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogDownloadCommandService).reconcileDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/sync",
    authedRouteResponse(
      Effect.flatMap(CatalogDownloadCommandService, (service) => service.syncDownloads()),
      successResponse,
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
