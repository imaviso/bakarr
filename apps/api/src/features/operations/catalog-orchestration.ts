import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";
import { EventBus } from "../events/event-bus.ts";
import type { CatalogLibraryReadSupportShape } from "./catalog-library-read-support.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import { makeCatalogDownloadOrchestration } from "./catalog-download-orchestration.ts";
import { makeCatalogLibraryOrchestration } from "./catalog-library-orchestration.ts";

export function makeCatalogOrchestration(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  eventBus: typeof EventBus.Service;
  tryDatabasePromise: TryDatabasePromise;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => Effect.Effect<void, import("./errors.ts").OperationsError | DatabaseError>;
  retryDownloadById: (
    id: number,
  ) => Effect.Effect<void, import("./errors.ts").OperationsError | DatabaseError>;
  reconcileDownloadByIdEffect: (
    id: number,
  ) => Effect.Effect<void, import("./errors.ts").OperationsError | DatabaseError>;
  syncDownloadState: (
    trigger: string,
  ) => Effect.Effect<void, DatabaseError | import("./errors.ts").OperationsInfrastructureError>;
  publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | import("./errors.ts").OperationsInfrastructureError
  >;
  publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  libraryReadSupport: CatalogLibraryReadSupportShape;
  nowIso: () => Effect.Effect<string>;
}) {
  const {
    db,
    fs,
    mediaProbe,
    eventBus,
    tryDatabasePromise,
    dbError,
    applyDownloadActionEffect,
    retryDownloadById,
    reconcileDownloadByIdEffect,
    syncDownloadState,
    publishDownloadProgress,
    publishLibraryScanProgress,
    nowIso,
    libraryReadSupport,
  } = input;

  const downloadOrchestration = makeCatalogDownloadOrchestration({
    applyDownloadActionEffect,
    db,
    nowIso,
    publishDownloadProgress,
    reconcileDownloadByIdEffect,
    retryDownloadById,
    syncDownloadState,
    tryDatabasePromise,
  });
  const libraryOrchestration = makeCatalogLibraryOrchestration({
    db,
    dbError,
    eventBus,
    fs,
    mediaProbe,
    nowIso,
    publishLibraryScanProgress,
    tryDatabasePromise,
    libraryReadSupport,
  });

  const {
    addRssFeed,
    deleteRssFeed,
    exportDownloadEvents,
    getCalendar,
    getDownloadProgress,
    getRenamePreview,
    getWantedMissing,
    importFiles,
    listAnimeRssFeeds,
    listDownloadEvents,
    listDownloadHistory,
    listDownloadQueue,
    listRssFeeds,
    pauseDownload,
    reconcileDownload,
    removeDownload,
    renameFiles,
    resumeDownload,
    retryDownload,
    runLibraryScan,
    syncDownloads,
    toggleRssFeed,
  } = {
    ...downloadOrchestration,
    ...libraryOrchestration,
  };

  return {
    addRssFeed,
    deleteRssFeed,
    exportDownloadEvents,
    getCalendar,
    getDownloadProgress,
    getRenamePreview,
    getWantedMissing,
    importFiles,
    listAnimeRssFeeds,
    listDownloadEvents,
    listDownloadHistory,
    listDownloadQueue,
    listRssFeeds,
    pauseDownload,
    reconcileDownload,
    removeDownload,
    renameFiles,
    resumeDownload,
    retryDownload,
    runLibraryScan,
    syncDownloads,
    toggleRssFeed,
  };
}
