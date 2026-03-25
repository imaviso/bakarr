import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";

import { ClockService } from "../lib/clock.ts";
import { FileSystem, isWithinPathRoot } from "../lib/filesystem.ts";
import { listLibraryRoots } from "../features/library-roots/library-roots-repository.ts";
import {
  DownloadService,
  LibraryService,
  RssService,
  SearchService,
} from "../features/operations/service.ts";
import { SystemService } from "../features/system/service.ts";
import { OperationsInputError } from "../features/operations/errors.ts";
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
  decodeJsonBody,
  decodePathParams,
  decodeQuery,
  jsonResponse,
  routeResponse,
  successResponse,
} from "./router-helpers.ts";
import { requireViewerFromHttpRequest } from "./route-auth.ts";
import { browsePath, escapeCsv } from "./route-fs.ts";

const readRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/downloads/queue",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(DownloadService, (service) => service.listDownloadQueue()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/history",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(DownloadService, (service) => service.listDownloadHistory()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/events",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const query = yield* decodeQuery(DownloadEventsQuerySchema);
          return yield* Effect.flatMap(DownloadService, (service) =>
            service.listDownloadEvents({
              animeId: query.anime_id,
              cursor: query.cursor,
              downloadId: query.download_id,
              direction: query.direction,
              endDate: query.end_date,
              eventType: query.event_type,
              limit: query.limit,
              startDate: query.start_date,
              status: query.status,
            }),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/downloads/events/export",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const query = yield* decodeQuery(DownloadEventsExportQuerySchema);
          const page = yield* Effect.flatMap(DownloadService, (service) =>
            service.exportDownloadEvents({
              animeId: query.anime_id,
              downloadId: query.download_id,
              endDate: query.end_date,
              eventType: query.event_type,
              limit: query.limit,
              order: query.order,
              startDate: query.start_date,
              status: query.status,
            }),
          );
          return { format: query.format ?? "json", page };
        }),
      ),
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

        return HttpServerResponse.text(JSON.stringify(page), {
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
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(RssService, (service) => service.listRssFeeds()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/wanted/missing",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const query = yield* decodeQuery(WantedMissingQuerySchema);
          return yield* Effect.flatMap(LibraryService, (service) =>
            service.getWantedMissing(query.limit ?? 50),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/calendar",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const query = yield* decodeQuery(CalendarQuerySchema);
          const now = yield* Effect.flatMap(ClockService, (clock) => clock.currentTimeMillis);
          const nowIso = new Date(now).toISOString();
          return yield* Effect.flatMap(LibraryService, (service) =>
            service.getCalendar(query.start ?? nowIso, query.end ?? nowIso),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/library/unmapped",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(LibraryService, (service) => service.getUnmappedFolders()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/library/browse",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const query = yield* decodeQuery(BrowseQuerySchema);
          const fs = yield* FileSystem;
          const config = yield* Effect.flatMap(SystemService, (s) => s.getConfig());
          const roots = yield* listLibraryRoots();

          const allowedPrefixes = [
            ...roots.map((r: { path: string }) => r.path),
            config.downloads.root_path,
            config.library.library_path,
          ].filter(Boolean) as string[];

          const requestedPath = query.path || ".";

          if (requestedPath !== ".") {
            const canonicalPath = yield* fs
              .realPath(requestedPath)
              .pipe(Effect.catchTag("FileSystemError", () => Effect.succeed(requestedPath)));
            const isAllowed = allowedPrefixes.some((prefix) =>
              isWithinPathRoot(canonicalPath, prefix),
            );

            if (!isAllowed) {
              return yield* new OperationsInputError({
                message: "Path is outside allowed library roots",
              });
            }
          } else {
            const entries = allowedPrefixes.map((path) => ({
              is_directory: true,
              name: path,
              path,
            }));
            const requestedLimit = query.limit ?? 100;
            const limit = Math.min(Math.max(1, requestedLimit), 500);
            const offset = Math.max(0, query.offset ?? 0);
            const total = entries.length;

            return {
              current_path: ".",
              entries: entries.slice(offset, offset + limit),
              has_more: offset + limit < total,
              limit,
              offset,
              parent_path: undefined,
              total,
            };
          }

          return yield* browsePath(fs, requestedPath, {
            limit: query.limit,
            offset: query.offset,
          });
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/search/releases",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const query = yield* decodeQuery(SearchReleasesQuerySchema);
          return yield* Effect.flatMap(SearchService, (service) =>
            service.searchReleases(query.query ?? "", query.anime_id, query.category, query.filter),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/search/episode/:animeId/:episodeNumber",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(SearchEpisodeParamsSchema);
          return yield* Effect.flatMap(SearchService, (service) =>
            service.searchEpisode(params.animeId, params.episodeNumber),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
);

const writeRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/search/download",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(SearchDownloadBodySchema);
          yield* Effect.flatMap(DownloadService, (service) => service.triggerDownload({ ...body }));
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/search-missing",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const text = yield* request.text;
          const body =
            text.trim().length === 0
              ? new SearchMissingBodySchema({ anime_id: undefined })
              : yield* Schema.decode(Schema.parseJson(SearchMissingBodySchema))(text).pipe(
                  Effect.mapError(
                    () =>
                      new OperationsInputError({
                        message: "Invalid request body for search missing downloads",
                      }),
                  ),
                );
          yield* Effect.flatMap(DownloadService, (service) =>
            service.triggerSearchMissing(body.anime_id),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/pause",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          yield* Effect.flatMap(DownloadService, (service) => service.pauseDownload(params.id));
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/resume",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          yield* Effect.flatMap(DownloadService, (service) => service.resumeDownload(params.id));
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/retry",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          yield* Effect.flatMap(DownloadService, (service) => service.retryDownload(params.id));
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/:id/reconcile",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          yield* Effect.flatMap(DownloadService, (service) => service.reconcileDownload(params.id));
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/sync",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(DownloadService, (service) => service.syncDownloads()),
      ),
      successResponse,
    ),
  ),
  HttpRouter.del(
    "/downloads/:id",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const query = yield* decodeQuery(DeleteDownloadQuerySchema);
          yield* Effect.flatMap(DownloadService, (service) =>
            service.removeDownload(params.id, query.delete_files === "true"),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/rss",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(AddRssFeedBodySchema);
          return yield* Effect.flatMap(RssService, (service) => service.addRssFeed({ ...body }));
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/rss/:id",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          yield* Effect.flatMap(RssService, (service) => service.deleteRssFeed(params.id));
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/rss/:id/toggle",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const body = yield* decodeJsonBody(EnabledBodySchema);
          yield* Effect.flatMap(RssService, (service) =>
            service.toggleRssFeed(params.id, body.enabled),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/scan",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(LibraryService, (service) => service.runUnmappedScan()),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/control",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(ControlUnmappedFolderBodySchema);
          yield* Effect.flatMap(LibraryService, (service) =>
            service.controlUnmappedFolder({ ...body }),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/control/bulk",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(BulkControlUnmappedFoldersBodySchema);
          yield* Effect.flatMap(LibraryService, (service) =>
            service.bulkControlUnmappedFolders({ ...body }),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/unmapped/import",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(ImportUnmappedFolderBodySchema);
          yield* Effect.flatMap(LibraryService, (service) =>
            service.importUnmappedFolder({ ...body }),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import/scan",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(ScanImportPathBodySchema);
          return yield* Effect.flatMap(LibraryService, (service) =>
            service.scanImportPath(body.path, body.anime_id),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/library/import",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(ImportFilesBodySchema);
          return yield* Effect.flatMap(LibraryService, (service) =>
            service.importFiles([...body.files]),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
);

export const operationsRouter = HttpRouter.concatAll(readRouter, writeRouter);

export const operationsHttpApp = HttpRouter.toHttpApp(operationsRouter);
