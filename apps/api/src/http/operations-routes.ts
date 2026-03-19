import { Effect } from "effect";
import type { Hono } from "hono";

import type {
  CalendarEvent,
  Download,
  EpisodeSearchResult,
  ImportResult,
  MissingEpisode,
  RenamePreviewItem,
  RenameResult,
  RssFeed,
  ScannerState,
  ScanResult,
  SearchResults,
} from "../../../../packages/shared/src/index.ts";
import { FileSystem, isWithinPathRoot } from "../lib/filesystem.ts";
import {
  DownloadService,
  LibraryService,
  RssService,
  SearchService,
} from "../features/operations/service.ts";
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
import type { AppVariables, RunEffect } from "./route-helpers.ts";
import { SystemService } from "../features/system/service.ts";
import { OperationsInputError } from "../features/operations/errors.ts";
import { listLibraryRoots } from "../features/library-roots/library-roots-repository.ts";
import {
  browsePath,
  escapeCsv,
  nowIso,
  parseParams,
  parseQuery,
  runRoute,
  withJsonBody,
  withOptionalJsonBody,
  withParams,
  withParamsAndBody,
  withQuery,
} from "./route-helpers.ts";

export function registerOperationsRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runEffect: RunEffect,
) {
  app.get("/api/downloads/queue", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(
        DownloadService,
        (service) => service.listDownloadQueue(),
      ),
      (value: Download[]) => c.json(value),
    ));

  app.get("/api/downloads/history", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(
        DownloadService,
        (service) => service.listDownloadHistory(),
      ),
      (value: Download[]) => c.json(value),
    ));

  app.get("/api/downloads/events", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, DownloadEventsQuerySchema, "list download events", (query) =>
        Effect.flatMap(DownloadService, (service) =>
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
          }))),
      (value) =>
        c.json(value),
    ));

  app.get("/api/downloads/events/export", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.gen(function* () {
        const query = yield* parseQuery(
          c,
          DownloadEventsExportQuerySchema,
          "export download events",
        );
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
          }));

        return {
          format: query.format ?? "json",
          page,
        };
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
                event.download_id === undefined
                  ? ""
                  : String(event.download_id),
                escapeCsv(event.torrent_name ?? ""),
                escapeCsv(event.message),
                escapeCsv(event.metadata ?? ""),
                escapeCsv(
                  event.metadata_json
                    ? JSON.stringify(event.metadata_json)
                    : "",
                ),
              ].join(",")
            ),
          ].join("\n");

          return new Response(csv, {
            headers: {
              ...exportHeaders,
              "Content-Disposition":
                'attachment; filename="bakarr-download-events.csv"',
              "Content-Type": "text/csv; charset=utf-8",
            },
          });
        }

        return new Response(JSON.stringify(page), {
          headers: {
            ...exportHeaders,
            "Content-Disposition":
              'attachment; filename="bakarr-download-events.json"',
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      },
    ));

  app.get("/api/rss", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(RssService, (service) => service.listRssFeeds()),
      (value: RssFeed[]) => c.json(value),
    ));

  app.get("/api/anime/:id/rss", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "list anime rss feeds", (params) =>
        Effect.flatMap(RssService, (service) =>
          service.listAnimeRssFeeds(params.id))),
      (value: RssFeed[]) =>
        c.json(value),
    ));

  app.get("/api/wanted/missing", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, WantedMissingQuerySchema, "get wanted missing", (query) =>
        Effect.flatMap(LibraryService, (service) =>
          service.getWantedMissing(query.limit ?? 50))),
      (value: MissingEpisode[]) =>
        c.json(value),
    ));

  app.get("/api/calendar", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, CalendarQuerySchema, "calendar", (query) =>
        Effect.flatMap(LibraryService, (service) =>
          service.getCalendar(query.start ?? nowIso(), query.end ?? nowIso()))),
      (value: CalendarEvent[]) =>
        c.json(value),
    ));

  app.get("/api/anime/:id/rename-preview", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "rename preview", (params) =>
        Effect.flatMap(LibraryService, (service) =>
          service.getRenamePreview(params.id))),
      (value: RenamePreviewItem[]) =>
        c.json(value),
    ));

  app.get("/api/library/unmapped", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(LibraryService, (service) => service.getUnmappedFolders()),
      (value: ScannerState) => c.json(value),
    ));

  app.get("/api/search/releases", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, SearchReleasesQuerySchema, "search releases", (query) =>
        Effect.flatMap(SearchService, (service) =>
          service.searchReleases(
            query.query ?? "",
            query.anime_id,
            query.category,
            query.filter,
          ))),
      (value: SearchResults) =>
        c.json(value),
    ));

  app.get("/api/search/episode/:animeId/:episodeNumber", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, SearchEpisodeParamsSchema, "search episode", (params) =>
        Effect.flatMap(SearchService, (service) =>
          service.searchEpisode(params.animeId, params.episodeNumber))),
      (value: EpisodeSearchResult[]) =>
        c.json(value),
    ));

  app.get("/api/library/browse", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.gen(function* () {
        const query = yield* parseQuery(c, BrowseQuerySchema, "browse library");
        const fs = yield* FileSystem;
        const config = yield* Effect.flatMap(
          SystemService,
          (s) => s.getConfig(),
        );
        const roots = yield* listLibraryRoots();

        const allowedPrefixes = [
          ...roots.map((r: { path: string }) => r.path),
          config.downloads.root_path,
          config.library.library_path,
        ].filter(Boolean) as string[];

        const requestedPath = query.path || ".";

        if (requestedPath !== ".") {
          const canonicalPath = yield* fs.realPath(requestedPath).pipe(
            Effect.catchTag("FileSystemError", () =>
              Effect.succeed(requestedPath)),
          );
          const isAllowed = allowedPrefixes.some(
            (prefix) =>
              isWithinPathRoot(canonicalPath, prefix),
          );

          if (!isAllowed) {
            return yield* new OperationsInputError({
              message: "Path is outside allowed library roots",
            });
          }
        } else if (requestedPath === ".") {
          const entries = allowedPrefixes.map((path) => ({
            is_directory: true,
            name: path,
            path: path,
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
      (value) => c.json(value),
    ));

  app.post("/api/search/download", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        SearchDownloadBodySchema,
        "trigger download",
        (body) =>
          Effect.flatMap(
            DownloadService,
            (service) => service.triggerDownload({ ...body }),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.post("/api/downloads/search-missing", (c) =>
    runRoute(
      c,
      runEffect,
      withOptionalJsonBody(
        c,
        SearchMissingBodySchema,
        "search missing downloads",
        (body) =>
          Effect.flatMap(DownloadService, (service) =>
            service.triggerSearchMissing(body.anime_id)),
      ),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/:id/pause", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "pause download", (params) =>
        Effect.flatMap(DownloadService, (service) =>
          service.pauseDownload(params.id))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/:id/resume", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "resume download", (params) =>
        Effect.flatMap(DownloadService, (service) =>
          service.resumeDownload(params.id))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/:id/retry", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "retry download", (params) =>
        Effect.flatMap(DownloadService, (service) =>
          service.retryDownload(params.id))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/:id/reconcile", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "reconcile download", (params) =>
        Effect.flatMap(DownloadService, (service) =>
          service.reconcileDownload(params.id))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/sync", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(DownloadService, (service) => service.syncDownloads()),
      () => c.json({ data: null, success: true }),
    ));

  app.delete("/api/downloads/:id", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.all({
        params: parseParams(c, IdParamsSchema, "delete download"),
        query: parseQuery(c, DeleteDownloadQuerySchema, "delete download"),
      }).pipe(
        Effect.flatMap(({ params, query }) =>
          Effect.flatMap(DownloadService, (service) =>
            service.removeDownload(params.id, query.delete_files === "true"))
        ),
      ),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/rss", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(c, AddRssFeedBodySchema, "add rss feed", (body) =>
        Effect.flatMap(RssService, (service) =>
          service.addRssFeed({ ...body }))),
      (value: RssFeed) =>
        c.json(value),
    ));

  app.delete("/api/rss/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "delete rss feed", (params) =>
        Effect.flatMap(RssService, (service) =>
          service.deleteRssFeed(params.id))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.put("/api/rss/:id/toggle", (c) =>
    runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        IdParamsSchema,
        EnabledBodySchema,
        "toggle rss feed",
        (
          params,
          body,
        ) =>
          Effect.flatMap(
            RssService,
            (service) => service.toggleRssFeed(params.id, body.enabled),
          ),
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/library/unmapped/scan", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(
        LibraryService,
        (service) => service.runUnmappedScan(),
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/library/unmapped/control", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        ControlUnmappedFolderBodySchema,
        "control unmapped folder",
        (body) =>
          Effect.flatMap(LibraryService, (service) =>
            service.controlUnmappedFolder({ ...body })),
      ),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/library/unmapped/control/bulk", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        BulkControlUnmappedFoldersBodySchema,
        "bulk control unmapped folders",
        (body) =>
          Effect.flatMap(LibraryService, (service) =>
            service.bulkControlUnmappedFolders({ ...body })),
      ),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/library/unmapped/import", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        ImportUnmappedFolderBodySchema,
        "import unmapped folder",
        (body) =>
          Effect.flatMap(LibraryService, (service) =>
            service.importUnmappedFolder({ ...body })),
      ),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/library/import/scan", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(c, ScanImportPathBodySchema, "scan import path", (body) =>
        Effect.flatMap(LibraryService, (service) =>
          service.scanImportPath(body.path, body.anime_id))),
      (value: ScanResult) =>
        c.json(value),
    ));

  app.post("/api/library/import", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(c, ImportFilesBodySchema, "import files", (body) =>
        Effect.flatMap(LibraryService, (service) =>
          service.importFiles([...body.files]))),
      (value: ImportResult) =>
        c.json(value),
    ));

  app.post("/api/anime/:id/rename", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "rename files", (params) =>
        Effect.flatMap(LibraryService, (service) =>
          service.renameFiles(params.id))),
      (value: RenameResult) =>
        c.json(value),
    ));
}
