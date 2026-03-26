import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";

import { DownloadEventsExportSchema } from "../../../../packages/shared/src/index.ts";

import { ClockService } from "../lib/clock.ts";
import { LibraryBrowseService } from "../features/operations/library-browse-service.ts";
import {
  DownloadService,
  LibraryService,
  RssService,
  SearchService,
} from "../features/operations/service-contract.ts";
import {
  AddRssFeedBodySchema,
  BrowseQuerySchema,
  BulkControlUnmappedFoldersBodySchema,
  CalendarQuerySchema,
  ControlUnmappedFolderBodySchema,
  DeleteDownloadQuerySchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
  EnabledBodySchema,
  IdParamsSchema,
  ImportFilesBodySchema,
  ImportUnmappedFolderBodySchema,
  ScanImportPathBodySchema,
  SearchDownloadBodySchema,
  SearchEpisodeParamsSchema,
  SearchMissingBodySchema,
  SearchReleasesQuerySchema,
  WantedMissingQuerySchema,
} from "./request-schemas.ts";
import {
  decodeJsonBodyWithLabel,
  decodeOptionalJsonBody,
  decodePathParams,
  decodeQueryWithLabel,
  authedRouteResponse,
  jsonResponse,
  successResponse,
} from "./router-helpers.ts";
import { escapeCsv } from "./route-fs.ts";

const DownloadEventsExportJsonSchema = Schema.parseJson(DownloadEventsExportSchema);
const encodeDownloadEventsExport = Schema.encodeSync(DownloadEventsExportJsonSchema);

const readRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/downloads/queue",
    authedRouteResponse(
      Effect.flatMap(DownloadService, (service) => service.listDownloadQueue()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/history",
    authedRouteResponse(
      Effect.flatMap(DownloadService, (service) => service.listDownloadHistory()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(DownloadEventsQuerySchema, "download events");
        return yield* (yield* DownloadService).listDownloadEvents({
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
        const page = yield* (yield* DownloadService).exportDownloadEvents({
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
      ({ format, page }) => {
        const exportHeaders = {
          "X-Bakarr-Exported-Events": String(page.exported),
          "X-Bakarr-Export-Limit": String(page.limit),
          "X-Bakarr-Export-Order": page.order,
          "X-Bakarr-Export-Truncated": String(page.truncated),
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
              "Content-Disposition": 'attachment; filename="bakarr-download-events.csv"',
            },
          });
        }

        return HttpServerResponse.text(encodeDownloadEventsExport(page), {
          contentType: "application/json; charset=utf-8",
          headers: {
            ...exportHeaders,
            "Content-Disposition": 'attachment; filename="bakarr-download-events.json"',
          },
        });
      },
    ),
  ),
  HttpRouter.get(
    "/rss",
    authedRouteResponse(
      Effect.flatMap(RssService, (service) => service.listRssFeeds()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/wanted/missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(WantedMissingQuerySchema, "wanted missing");
        return yield* (yield* LibraryService).getWantedMissing(query.limit ?? 50);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/calendar",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(CalendarQuerySchema, "calendar");
        const now = yield* (yield* ClockService).currentTimeMillis;
        const nowIso = new Date(now).toISOString();
        return yield* (yield* LibraryService).getCalendar(
          query.start ?? nowIso,
          query.end ?? nowIso,
        );
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/library/unmapped",
    authedRouteResponse(
      Effect.flatMap(LibraryService, (service) => service.getUnmappedFolders()),
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
  HttpRouter.get(
    "/search/releases",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(SearchReleasesQuerySchema, "search releases");
        return yield* (yield* SearchService).searchReleases(
          query.query ?? "",
          query.anime_id,
          query.category,
          query.filter,
        );
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/search/episode/:animeId/:episodeNumber",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(SearchEpisodeParamsSchema);
        return yield* (yield* SearchService).searchEpisode(params.animeId, params.episodeNumber);
      }),
      jsonResponse,
    ),
  ),
);

const writeRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/search/download",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(SearchDownloadBodySchema, "search download");
        yield* (yield* DownloadService).triggerDownload(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/search-missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeOptionalJsonBody({
          empty: new SearchMissingBodySchema({ anime_id: undefined }),
          label: "search missing downloads",
          schema: SearchMissingBodySchema,
        });
        yield* (yield* DownloadService).triggerSearchMissing(body.anime_id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/pause",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadService).pauseDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/resume",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadService).resumeDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/retry",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadService).retryDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/reconcile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* DownloadService).reconcileDownload(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/sync",
    authedRouteResponse(
      Effect.flatMap(DownloadService, (service) => service.syncDownloads()),
      successResponse,
    ),
  ),
  HttpRouter.del(
    "/downloads/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQueryWithLabel(DeleteDownloadQuerySchema, "delete download");
        yield* (yield* DownloadService).removeDownload(params.id, query.delete_files === "true");
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddRssFeedBodySchema, "add RSS feed");
        return yield* (yield* RssService).addRssFeed(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/rss/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* RssService).deleteRssFeed(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/rss/:id/toggle",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(EnabledBodySchema, "toggle RSS feed");
        yield* (yield* RssService).toggleRssFeed(params.id, body.enabled);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/scan",
    authedRouteResponse(
      Effect.flatMap(LibraryService, (service) => service.runUnmappedScan()),
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
        yield* (yield* LibraryService).controlUnmappedFolder(body);
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
        yield* (yield* LibraryService).bulkControlUnmappedFolders(body);
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
        yield* (yield* LibraryService).importUnmappedFolder(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ScanImportPathBodySchema, "scan import path");
        return yield* (yield* LibraryService).scanImportPath(body.path, body.anime_id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ImportFilesBodySchema, "import files");
        return yield* (yield* LibraryService).importFiles(body.files);
      }),
      jsonResponse,
    ),
  ),
);

export const operationsRouter = HttpRouter.concatAll(readRouter, writeRouter);
