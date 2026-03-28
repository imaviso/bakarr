import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import { EventBus } from "../events/event-bus.ts";
import { DownloadControlService } from "./download-service-tags.ts";
import { OperationsProgress } from "./operations-progress.ts";
import { CatalogLibraryReadSupport } from "./catalog-library-read-support-service.ts";
import { makeCatalogOrchestration } from "./catalog-orchestration.ts";
import type { CatalogDownloadActionSupportShape } from "./catalog-orchestration-download-action-support.ts";
import type { CatalogDownloadViewSupportShape } from "./catalog-download-view-support.ts";
import type { CatalogLibraryReadSupportShape } from "./catalog-library-read-support.ts";
import type { CatalogLibraryScanSupportShape } from "./catalog-library-scan-support.ts";
import type { CatalogLibraryWriteSupportShape } from "./catalog-orchestration-library-write-support.ts";
import type { CatalogRssSupportShape } from "./catalog-rss-support.ts";
import { tryDatabasePromise, toDatabaseError } from "../../lib/effect-db.ts";

export interface CatalogReadServiceShape {
  readonly exportDownloadEvents: CatalogDownloadViewSupportShape["exportDownloadEvents"];
  readonly getCalendar: CatalogLibraryReadSupportShape["getCalendar"];
  readonly getDownloadProgress: CatalogDownloadViewSupportShape["getDownloadProgress"];
  readonly getRenamePreview: CatalogLibraryReadSupportShape["getRenamePreview"];
  readonly getWantedMissing: CatalogLibraryReadSupportShape["getWantedMissing"];
  readonly listAnimeRssFeeds: CatalogRssSupportShape["listAnimeRssFeeds"];
  readonly listDownloadEvents: CatalogDownloadViewSupportShape["listDownloadEvents"];
  readonly listDownloadHistory: CatalogDownloadViewSupportShape["listDownloadHistory"];
  readonly listDownloadQueue: CatalogDownloadViewSupportShape["listDownloadQueue"];
  readonly listRssFeeds: CatalogRssSupportShape["listRssFeeds"];
}

export class CatalogReadService extends Context.Tag("@bakarr/api/CatalogReadService")<
  CatalogReadService,
  CatalogReadServiceShape
>() {}

const makeCatalogWorkflow = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const clock = yield* ClockService;
  const downloadControl = yield* DownloadControlService;
  const progress = yield* OperationsProgress;
  const libraryReadSupport = yield* CatalogLibraryReadSupport;

  return makeCatalogOrchestration({
    applyDownloadActionEffect: downloadControl.applyDownloadActionEffect,
    db,
    dbError: toDatabaseError,
    eventBus,
    fs,
    mediaProbe,
    nowIso: () =>
      clock.currentTimeMillis.pipe(Effect.map((value) => new Date(value).toISOString())),
    publishDownloadProgress: progress.publishDownloadProgress,
    publishLibraryScanProgress: progress.publishLibraryScanProgress,
    reconcileDownloadByIdEffect: downloadControl.reconcileDownloadByIdEffect,
    retryDownloadById: downloadControl.retryDownloadById,
    syncDownloadState: downloadControl.syncDownloadState,
    tryDatabasePromise,
    libraryReadSupport,
  });
});

export const CatalogReadServiceLive = Layer.effect(
  CatalogReadService,
  Effect.gen(function* () {
    const catalog = yield* makeCatalogWorkflow;

    return {
      exportDownloadEvents: catalog.exportDownloadEvents,
      getCalendar: catalog.getCalendar,
      getDownloadProgress: catalog.getDownloadProgress,
      getRenamePreview: catalog.getRenamePreview,
      getWantedMissing: catalog.getWantedMissing,
      listAnimeRssFeeds: catalog.listAnimeRssFeeds,
      listDownloadEvents: catalog.listDownloadEvents,
      listDownloadHistory: catalog.listDownloadHistory,
      listDownloadQueue: catalog.listDownloadQueue,
      listRssFeeds: catalog.listRssFeeds,
    };
  }),
);

export interface CatalogDownloadControlServiceShape {
  readonly pauseDownload: CatalogDownloadActionSupportShape["pauseDownload"];
  readonly reconcileDownload: CatalogDownloadActionSupportShape["reconcileDownload"];
  readonly removeDownload: CatalogDownloadActionSupportShape["removeDownload"];
  readonly resumeDownload: CatalogDownloadActionSupportShape["resumeDownload"];
  readonly retryDownload: CatalogDownloadActionSupportShape["retryDownload"];
  readonly syncDownloads: CatalogDownloadActionSupportShape["syncDownloads"];
}

export class CatalogDownloadControlService extends Context.Tag(
  "@bakarr/api/CatalogDownloadControlService",
)<CatalogDownloadControlService, CatalogDownloadControlServiceShape>() {}

export const CatalogDownloadControlServiceLive = Layer.effect(
  CatalogDownloadControlService,
  Effect.gen(function* () {
    const catalog = yield* makeCatalogWorkflow;

    return {
      pauseDownload: catalog.pauseDownload,
      reconcileDownload: catalog.reconcileDownload,
      removeDownload: catalog.removeDownload,
      resumeDownload: catalog.resumeDownload,
      retryDownload: catalog.retryDownload,
      syncDownloads: catalog.syncDownloads,
    };
  }),
);

export interface CatalogLibraryServiceShape {
  readonly importFiles: CatalogLibraryWriteSupportShape["importFiles"];
  readonly renameFiles: CatalogLibraryWriteSupportShape["renameFiles"];
  readonly runLibraryScan: CatalogLibraryScanSupportShape["runLibraryScan"];
}

export class CatalogLibraryService extends Context.Tag("@bakarr/api/CatalogLibraryService")<
  CatalogLibraryService,
  CatalogLibraryServiceShape
>() {}

export const CatalogLibraryServiceLive = Layer.effect(
  CatalogLibraryService,
  Effect.gen(function* () {
    const catalog = yield* makeCatalogWorkflow;

    return {
      importFiles: catalog.importFiles,
      renameFiles: catalog.renameFiles,
      runLibraryScan: catalog.runLibraryScan,
    };
  }),
);

export interface CatalogRssServiceShape {
  readonly addRssFeed: CatalogRssSupportShape["addRssFeed"];
  readonly deleteRssFeed: CatalogRssSupportShape["deleteRssFeed"];
  readonly toggleRssFeed: CatalogRssSupportShape["toggleRssFeed"];
}

export class CatalogRssService extends Context.Tag("@bakarr/api/CatalogRssService")<
  CatalogRssService,
  CatalogRssServiceShape
>() {}

export const CatalogRssServiceLive = Layer.effect(
  CatalogRssService,
  Effect.gen(function* () {
    const catalog = yield* makeCatalogWorkflow;

    return {
      addRssFeed: catalog.addRssFeed,
      deleteRssFeed: catalog.deleteRssFeed,
      toggleRssFeed: catalog.toggleRssFeed,
    };
  }),
);
