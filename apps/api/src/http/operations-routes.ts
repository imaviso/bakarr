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
import { OperationsService } from "../features/operations/service.ts";
import {
  AddRssFeedBodySchema,
  BrowseQuerySchema,
  CalendarQuerySchema,
  DeleteDownloadQuerySchema,
  DownloadEventsQuerySchema,
  EnabledBodySchema,
  IdParamsSchema,
  ImportFilesBodySchema,
  ImportUnmappedFolderBodySchema,
  ScanImportPathBodySchema,
  SearchDownloadBodySchema,
  SearchEpisodeParamsSchema,
  SearchReleasesQuerySchema,
  SearchMissingBodySchema,
  WantedMissingQuerySchema,
} from "./request-schemas.ts";
import type { AppVariables, RunEffect } from "./route-helpers.ts";
import {
  browsePath,
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
      Effect.flatMap(OperationsService, (service) => service.listDownloadQueue()),
      (value: Download[]) => c.json(value),
    ));

  app.get("/api/downloads/history", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(OperationsService, (service) => service.listDownloadHistory()),
      (value: Download[]) => c.json(value),
    ));

  app.get("/api/downloads/events", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, DownloadEventsQuerySchema, "list download events", (query) =>
        Effect.flatMap(OperationsService, (service) =>
          service.listDownloadEvents({
            animeId: query.anime_id,
            downloadId: query.download_id,
            eventType: query.event_type,
            limit: query.limit,
          }))
      ),
      (value) => c.json(value),
    ));

  app.get("/api/rss", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(OperationsService, (service) => service.listRssFeeds()),
      (value: RssFeed[]) => c.json(value),
    ));

  app.get("/api/anime/:id/rss", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "list anime rss feeds", (params) =>
        Effect.flatMap(OperationsService, (service) =>
          service.listAnimeRssFeeds(params.id))
      ),
      (value: RssFeed[]) => c.json(value),
    ));

  app.get("/api/wanted/missing", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, WantedMissingQuerySchema, "get wanted missing", (query) =>
        Effect.flatMap(OperationsService, (service) =>
          service.getWantedMissing(query.limit ?? 50))
      ),
      (value: MissingEpisode[]) => c.json(value),
    ));

  app.get("/api/calendar", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, CalendarQuerySchema, "calendar", (query) =>
        Effect.flatMap(OperationsService, (service) =>
          service.getCalendar(query.start ?? nowIso(), query.end ?? nowIso()))
      ),
      (value: CalendarEvent[]) => c.json(value),
    ));

  app.get("/api/anime/:id/rename-preview", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "rename preview", (params) =>
        Effect.flatMap(OperationsService, (service) => service.getRenamePreview(params.id))
      ),
      (value: RenamePreviewItem[]) => c.json(value),
    ));

  app.get("/api/library/unmapped", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(OperationsService, (service) => service.getUnmappedFolders()),
      (value: ScannerState) => c.json(value),
    ));

  app.get("/api/search/releases", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, SearchReleasesQuerySchema, "search releases", (query) =>
        Effect.flatMap(OperationsService, (service) =>
          service.searchReleases(
            query.query ?? "",
            query.anime_id,
            query.category,
            query.filter,
          ))
      ),
      (value: SearchResults) => c.json(value),
    ));

  app.get("/api/search/episode/:animeId/:episodeNumber", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, SearchEpisodeParamsSchema, "search episode", (params) =>
        Effect.flatMap(OperationsService, (service) =>
          service.searchEpisode(params.animeId, params.episodeNumber))
      ),
      (value: EpisodeSearchResult[]) => c.json(value),
    ));

  app.get("/api/library/browse", async (c) => {
    const query = await runEffect(parseQuery(c, BrowseQuerySchema, "browse library"));
    return c.json(await browsePath(query.path || "."));
  });

  app.post("/api/search/download", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(c, SearchDownloadBodySchema, "trigger download", (body) =>
        Effect.flatMap(OperationsService, (service) => service.triggerDownload({ ...body }))
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
          Effect.flatMap(OperationsService, (service) =>
            service.triggerSearchMissing(body.anime_id)),
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/:id/pause", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "pause download", (params) =>
        Effect.flatMap(OperationsService, (service) => service.pauseDownload(params.id))
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/:id/resume", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "resume download", (params) =>
        Effect.flatMap(OperationsService, (service) => service.resumeDownload(params.id))
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/:id/retry", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "retry download", (params) =>
        Effect.flatMap(OperationsService, (service) => service.retryDownload(params.id))
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/:id/reconcile", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "reconcile download", (params) =>
        Effect.flatMap(OperationsService, (service) => service.reconcileDownload(params.id))
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/downloads/sync", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(OperationsService, (service) => service.syncDownloads()),
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
          Effect.flatMap(OperationsService, (service) =>
            service.removeDownload(params.id, query.delete_files === "true"))
        ),
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/rss", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(c, AddRssFeedBodySchema, "add rss feed", (body) =>
        Effect.flatMap(OperationsService, (service) => service.addRssFeed({ ...body }))
      ),
      (value: RssFeed) => c.json(value),
    ));

  app.delete("/api/rss/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "delete rss feed", (params) =>
        Effect.flatMap(OperationsService, (service) => service.deleteRssFeed(params.id))
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.put("/api/rss/:id/toggle", (c) =>
    runRoute(
      c,
      runEffect,
      withParamsAndBody(c, IdParamsSchema, EnabledBodySchema, "toggle rss feed", (
        params,
        body,
      ) =>
        Effect.flatMap(OperationsService, (service) =>
          service.toggleRssFeed(params.id, body.enabled)
        )
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/library/unmapped/scan", (c) => {
    queueMicrotask(() => {
      void runEffect(
        Effect.flatMap(OperationsService, (service) => service.runUnmappedScan()),
      ).catch(() => undefined);
    });
    return c.json({ data: null, success: true });
  });

  app.post("/api/library/unmapped/import", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        ImportUnmappedFolderBodySchema,
        "import unmapped folder",
        (body) =>
          Effect.flatMap(OperationsService, (service) =>
            service.importUnmappedFolder({ ...body })),
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/library/import/scan", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(c, ScanImportPathBodySchema, "scan import path", (body) =>
        Effect.flatMap(OperationsService, (service) =>
          service.scanImportPath(body.path, body.anime_id))
      ),
      (value: ScanResult) => c.json(value),
    ));

  app.post("/api/library/import", (c) =>
    runRoute(
      c,
      runEffect,
      withJsonBody(c, ImportFilesBodySchema, "import files", (body) =>
        Effect.flatMap(OperationsService, (service) => service.importFiles([...body.files]))
      ),
      (value: ImportResult) => c.json(value),
    ));

  app.post("/api/anime/:id/rename", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "rename files", (params) =>
        Effect.flatMap(OperationsService, (service) => service.renameFiles(params.id))
      ),
      (value: RenameResult) => c.json(value),
    ));
}
