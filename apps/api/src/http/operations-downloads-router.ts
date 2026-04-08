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
          toDownloadEventsQueryInput(query),
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
        const input = toDownloadEventsExportInput(query);

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

function toDownloadEventsQueryInput(query: {
  readonly anime_id?: number | undefined;
  readonly cursor?: string | undefined;
  readonly direction?: "next" | "prev" | undefined;
  readonly download_id?: number | undefined;
  readonly end_date?: string | undefined;
  readonly event_type?: string | undefined;
  readonly limit?: number | undefined;
  readonly start_date?: string | undefined;
  readonly status?: string | undefined;
}) {
  return {
    ...(query.anime_id === undefined ? {} : { animeId: query.anime_id }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.download_id === undefined ? {} : { downloadId: query.download_id }),
    ...(query.direction === undefined ? {} : { direction: query.direction }),
    ...(query.end_date === undefined ? {} : { endDate: query.end_date }),
    ...(query.event_type === undefined ? {} : { eventType: query.event_type }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
    ...(query.start_date === undefined ? {} : { startDate: query.start_date }),
    ...(query.status === undefined ? {} : { status: query.status }),
  };
}

function toDownloadEventsExportInput(query: {
  readonly anime_id?: number | undefined;
  readonly download_id?: number | undefined;
  readonly end_date?: string | undefined;
  readonly event_type?: string | undefined;
  readonly limit?: number | undefined;
  readonly order?: "asc" | "desc" | undefined;
  readonly start_date?: string | undefined;
  readonly status?: string | undefined;
}) {
  return {
    ...(query.anime_id === undefined ? {} : { animeId: query.anime_id }),
    ...(query.download_id === undefined ? {} : { downloadId: query.download_id }),
    ...(query.end_date === undefined ? {} : { endDate: query.end_date }),
    ...(query.event_type === undefined ? {} : { eventType: query.event_type }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
    ...(query.order === undefined ? {} : { order: query.order }),
    ...(query.start_date === undefined ? {} : { startDate: query.start_date }),
    ...(query.status === undefined ? {} : { status: query.status }),
  };
}

function buildDownloadExportHeaders(header: {
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
