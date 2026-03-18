import { Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { EventBus } from "../events/event-bus.ts";
import { AniListClient } from "../anime/anilist.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { RssClient } from "./rss-client.ts";
import { SeaDexClient } from "./seadex-client.ts";
import { makeSearchOrchestration } from "./search-orchestration.ts";
import { makeDownloadOrchestration } from "./download-orchestration.ts";
import { makeCatalogOrchestration } from "./catalog-orchestration.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import {
  dbError,
  maybeQBitConfig,
  tryDatabasePromise,
  tryOperationsPromise,
  wrapOperationsError,
} from "./service-support.ts";
import {
  InternalOperationsService,
  type InternalOperationsShape,
  projectOperationsServices,
} from "./service-wiring.ts";
import {
  makeOperationsProgressPublishers,
  makeOperationsSharedState,
} from "./runtime-support.ts";

export {
  DownloadService,
  type DownloadServiceShape,
  LibraryService,
  type LibraryServiceShape,
  RssService,
  type RssServiceShape,
  SearchService,
  type SearchServiceShape,
} from "./service-contract.ts";

export {
  applyRemotePathMappings,
  inferCoveredEpisodeNumbers,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
} from "./download-lifecycle.ts";

export { mapQBitState } from "./download-orchestration-shared.ts";

export {
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "./naming-support.ts";

const makeOperationsService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const aniList = yield* AniListClient;
  const qbitClient = yield* QBitTorrentClient;
  const rssClient = yield* RssClient;
  const seadexClient = yield* SeaDexClient;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;

  const { triggerSemaphore, unmappedScanRunning } =
    yield* makeOperationsSharedState();

  const downloadOrchestration = makeDownloadOrchestration({
    db,
    dbError,
    eventBus,
    fs,
    mediaProbe,
    maybeQBitConfig,
    qbitClient,
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
    triggerSemaphore,
  });

  const {
    publishDownloadProgress,
    publishLibraryScanProgress,
    publishRssCheckProgress,
  } = yield* makeOperationsProgressPublishers({
    eventBus,
    publishDownloadProgressEffect: downloadOrchestration
      .publishDownloadProgress(),
  });

  const searchOrchestration = makeSearchOrchestration({
    aniList,
    db,
    dbError,
    eventBus,
    fs,
    mediaProbe,
    maybeQBitConfig,
    publishDownloadProgress,
    publishRssCheckProgress,
    qbitClient,
    rssClient,
    seadexClient,
    triggerSemaphore,
    tryDatabasePromise,
    tryOperationsPromise,
    unmappedScanRunning,
    wrapOperationsError,
  });

  const {
    applyDownloadActionEffect,
    reconcileDownloadByIdEffect,
    retryDownloadById,
    syncDownloadState,
    triggerDownload,
  } = downloadOrchestration;

  const {
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
    getUnmappedFolders,
    importUnmappedFolder,
    runRssCheck,
    runUnmappedScan,
    scanImportPath,
    searchEpisode,
    searchReleases,
    triggerSearchMissing,
  } = searchOrchestration;

  const catalogOrchestration = makeCatalogOrchestration({
    applyDownloadActionEffect,
    db,
    dbError,
    eventBus,
    fs,
    mediaProbe,
    publishDownloadProgress,
    publishLibraryScanProgress,
    reconcileDownloadByIdEffect,
    retryDownloadById,
    syncDownloadState,
    tryDatabasePromise,
    tryOperationsPromise,
  });

  const {
    addRssFeed,
    deleteRssFeed,
    getCalendar,
    getDownloadProgress,
    getRenamePreview,
    getWantedMissing,
    exportDownloadEvents,
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
  } = catalogOrchestration;

  return {
    listRssFeeds,
    listAnimeRssFeeds,
    addRssFeed,
    deleteRssFeed,
    toggleRssFeed,
    getWantedMissing,
    getCalendar,
    getRenamePreview,
    renameFiles,
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
    getUnmappedFolders,
    runUnmappedScan,
    importUnmappedFolder,
    scanImportPath,
    importFiles,
    listDownloadQueue,
    listDownloadHistory,
    getDownloadProgress,
    exportDownloadEvents,
    pauseDownload,
    resumeDownload,
    removeDownload,
    retryDownload,
    reconcileDownload,
    listDownloadEvents,
    syncDownloads,
    searchReleases,
    searchEpisode,
    triggerDownload,
    triggerSearchMissing,
    runRssCheck,
    runLibraryScan,
  } satisfies InternalOperationsShape;
});

const internalLayer = Layer.scoped(
  InternalOperationsService,
  makeOperationsService,
);

export const OperationsServiceLive = projectOperationsServices(internalLayer);
