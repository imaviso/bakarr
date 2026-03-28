import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { CatalogWorkflow } from "../features/operations/catalog-service-tags.ts";
import { IdParamsSchema } from "./common-request-schemas.ts";
import { buildDownloadEventsExportResponse } from "./download-events-export.ts";
import {
  DeleteDownloadQuerySchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
} from "./operations-request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "./router-helpers.ts";

export const downloadsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/downloads/queue",
    authedRouteResponse(
      Effect.flatMap(CatalogWorkflow, (service) => service.listDownloadQueue()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/history",
    authedRouteResponse(
      Effect.flatMap(CatalogWorkflow, (service) => service.listDownloadHistory()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(DownloadEventsQuerySchema, "download events");
        return yield* (yield* CatalogWorkflow).listDownloadEvents({
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
        const page = yield* (yield* CatalogWorkflow).exportDownloadEvents({
          animeId: query.anime_id,
          downloadId: query.download_id,
          endDate: query.end_date,
          eventType: query.event_type,
          limit: query.limit,
          order: query.order,
          startDate: query.start_date,
          status: query.status,
        });
        return { format: query.format ?? "json", page };
      }),
      ({ format, page }) => buildDownloadEventsExportResponse(page, format),
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/pause",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogWorkflow).pauseDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/resume",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogWorkflow).resumeDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/retry",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogWorkflow).retryDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/reconcile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogWorkflow).reconcileDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/sync",
    authedRouteResponse(
      Effect.flatMap(CatalogWorkflow, (service) => service.syncDownloads()),
      successResponse,
    ),
  ),
  HttpRouter.del(
    "/downloads/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQueryWithLabel(DeleteDownloadQuerySchema, "delete download");
        yield* (yield* CatalogWorkflow).removeDownload(params.id, query.delete_files === "true");
      }),
      successResponse,
    ),
  ),
);
