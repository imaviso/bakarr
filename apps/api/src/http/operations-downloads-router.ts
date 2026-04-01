import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { HttpServerResponse } from "@effect/platform";
import { CatalogDownloadService } from "@/features/operations/catalog-download-orchestration.ts";
import { IdParamsSchema } from "@/http/common-request-schemas.ts";
import { escapeCsv } from "@/http/route-fs.ts";
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
      Effect.flatMap(CatalogDownloadService, (service) => service.listDownloadQueue()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/history",
    authedRouteResponse(
      Effect.flatMap(CatalogDownloadService, (service) => service.listDownloadHistory()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(DownloadEventsQuerySchema, "download events");
        return yield* (yield* CatalogDownloadService).listDownloadEvents({
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
        const service = yield* CatalogDownloadService;
        const page = yield* service.exportDownloadEvents({
          animeId: query.anime_id,
          downloadId: query.download_id,
          endDate: query.end_date,
          eventType: query.event_type,
          limit: query.limit,
          order: query.order,
          startDate: query.start_date,
          status: query.status,
        });

        if ((query.format ?? "json") === "csv") {
          return {
            format: "csv" as const,
            page,
          };
        }

        const streamed = yield* service.streamDownloadEventsExportJson({
          animeId: query.anime_id,
          downloadId: query.download_id,
          endDate: query.end_date,
          eventType: query.event_type,
          limit: query.limit,
          order: query.order,
          startDate: query.start_date,
          status: query.status,
        });

        return {
          format: "json" as const,
          page: {
            ...page,
            events: [],
          },
          stream: streamed.stream,
        };
      }),
      (result) => {
        const { format, page } = result;
        const exportHeaders = {
          "X-Bakarr-Export-Limit": String(page.limit),
          "X-Bakarr-Export-Order": page.order,
          "X-Bakarr-Export-Truncated": String(page.truncated),
          "X-Bakarr-Exported-Events": String(page.exported),
          "X-Bakarr-Generated-At": page.generated_at,
          "X-Bakarr-Total-Events": String(page.total),
        };

        if (format === "csv") {
          const csv = [
            "id,created_at,event_type,from_status,to_status,anime_id,anime_title,download_id,torrent_name,message,metadata,metadata_json",
            ...page.events.map((event) =>
              [
                String(event.id),
                event.created_at,
                escapeCsv(event.event_type),
                escapeCsv(event.from_status ?? ""),
                escapeCsv(event.to_status ?? ""),
                event.anime_id === undefined ? "" : String(event.anime_id),
                escapeCsv(event.anime_title ?? ""),
                event.download_id === undefined ? "" : String(event.download_id),
                escapeCsv(event.torrent_name ?? ""),
                escapeCsv(event.message),
                escapeCsv(event.metadata ?? ""),
                escapeCsv(event.metadata_json ? JSON.stringify(event.metadata_json) : ""),
              ].join(","),
            ),
          ].join("\n");

          return HttpServerResponse.text(csv, {
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
        yield* (yield* CatalogDownloadService).pauseDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/resume",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogDownloadService).resumeDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/retry",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogDownloadService).retryDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/reconcile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogDownloadService).reconcileDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/sync",
    authedRouteResponse(
      Effect.flatMap(CatalogDownloadService, (service) => service.syncDownloads()),
      successResponse,
    ),
  ),
  HttpRouter.del(
    "/downloads/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQueryWithLabel(DeleteDownloadQuerySchema, "delete download");
        yield* (yield* CatalogDownloadService).removeDownload(
          params.id,
          query.delete_files === "true",
        );
      }),
      successResponse,
    ),
  ),
);
