import { Context, Effect, Layer, Ref } from "effect";

import type {
  CalendarEvent,
  Download,
  DownloadEvent,
  DownloadStatus,
  EpisodeSearchResult,
  ImportResult,
  MissingEpisode,
  RenamePreviewItem,
  RenameResult,
  RssFeed,
  ScannerState,
  ScanResult,
  SearchResults,
} from "../../../../../packages/shared/src/index.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { EventBus } from "../events/event-bus.ts";
import { AniListClient } from "../anime/anilist.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { RssClient } from "./rss-client.ts";
import { makeSearchOrchestration } from "./search-orchestration.ts";
import { makeDownloadOrchestration } from "./download-orchestration.ts";
import { makeCatalogOrchestration } from "./catalog-orchestration.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import {
  dbError,
  makeCoalescedEffectRunner,
  makeLatestValuePublisher,
  maybeQBitConfig,
  tryDatabasePromise,
  tryOperationsPromise,
  wrapOperationsError,
} from "./service-support.ts";

export {
  applyRemotePathMappings,
  inferCoveredEpisodeNumbers,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
} from "./download-lifecycle.ts";
import { type OperationsError } from "./errors.ts";

export interface RssServiceShape {
  readonly listRssFeeds: () => Effect.Effect<RssFeed[], DatabaseError>;
  readonly listAnimeRssFeeds: (
    animeId: number,
  ) => Effect.Effect<RssFeed[], DatabaseError>;
  readonly addRssFeed: (
    input: { anime_id: number; url: string; name?: string },
  ) => Effect.Effect<RssFeed, OperationsError | DatabaseError>;
  readonly deleteRssFeed: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly toggleRssFeed: (
    id: number,
    enabled: boolean,
  ) => Effect.Effect<void, DatabaseError>;
  readonly runRssCheck: () => Effect.Effect<
    { newItems: number },
    DatabaseError
  >;
}

export interface LibraryServiceShape {
  readonly getWantedMissing: (
    limit: number,
  ) => Effect.Effect<MissingEpisode[], DatabaseError>;
  readonly getCalendar: (
    start: string,
    end: string,
  ) => Effect.Effect<CalendarEvent[], DatabaseError>;
  readonly getRenamePreview: (
    animeId: number,
  ) => Effect.Effect<RenamePreviewItem[], OperationsError | DatabaseError>;
  readonly renameFiles: (
    animeId: number,
  ) => Effect.Effect<RenameResult, OperationsError | DatabaseError>;
  readonly getUnmappedFolders: () => Effect.Effect<ScannerState, DatabaseError>;
  readonly runUnmappedScan: () => Effect.Effect<
    { folderCount: number },
    DatabaseError
  >;
  readonly importUnmappedFolder: (
    input: { folder_name: string; anime_id: number; profile_name?: string },
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly scanImportPath: (
    path: string,
    animeId?: number,
  ) => Effect.Effect<ScanResult, DatabaseError>;
  readonly importFiles: (
    files: readonly {
      source_path: string;
      anime_id: number;
      episode_number: number;
      season?: number;
    }[],
  ) => Effect.Effect<ImportResult, DatabaseError>;
  readonly runLibraryScan: () => Effect.Effect<
    { matched: number; scanned: number },
    DatabaseError
  >;
}

export interface DownloadServiceShape {
  readonly listDownloadQueue: () => Effect.Effect<Download[], DatabaseError>;
  readonly listDownloadHistory: () => Effect.Effect<Download[], DatabaseError>;
  readonly getDownloadProgress: () => Effect.Effect<
    DownloadStatus[],
    DatabaseError
  >;
  readonly pauseDownload: (
    id: number,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly resumeDownload: (
    id: number,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly removeDownload: (
    id: number,
    deleteFiles: boolean,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly retryDownload: (
    id: number,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly reconcileDownload: (
    id: number,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly syncDownloads: () => Effect.Effect<void, DatabaseError>;
  readonly listDownloadEvents: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly eventType?: string;
    readonly limit?: number;
  }) => Effect.Effect<DownloadEvent[], DatabaseError>;
  readonly triggerDownload: (
    input: {
      anime_id: number;
      magnet: string;
      episode_number: number;
      title: string;
      group?: string;
      info_hash?: string;
      is_batch?: boolean;
    },
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly triggerSearchMissing: (
    animeId?: number,
  ) => Effect.Effect<void, DatabaseError>;
}

export interface SearchServiceShape {
  readonly searchReleases: (
    query: string,
    animeId?: number,
    category?: string,
    filter?: string,
  ) => Effect.Effect<SearchResults, DatabaseError>;
  readonly searchEpisode: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<EpisodeSearchResult[], OperationsError | DatabaseError>;
}

export class RssService extends Context.Tag("@bakarr/api/RssService")<
  RssService,
  RssServiceShape
>() {}
export class LibraryService extends Context.Tag("@bakarr/api/LibraryService")<
  LibraryService,
  LibraryServiceShape
>() {}
export class DownloadService extends Context.Tag("@bakarr/api/DownloadService")<
  DownloadService,
  DownloadServiceShape
>() {}
export class SearchService extends Context.Tag("@bakarr/api/SearchService")<
  SearchService,
  SearchServiceShape
>() {}

class InternalOperationsService
  extends Context.Tag("@bakarr/api/InternalOperationsService")<
    InternalOperationsService,
    & RssServiceShape
    & LibraryServiceShape
    & DownloadServiceShape
    & SearchServiceShape
  >() {}

const makeOperationsService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const aniList = yield* AniListClient;
  const qbitClient = yield* QBitTorrentClient;
  const rssClient = yield* RssClient;
  const fs = yield* FileSystem;

  const triggerSemaphore = yield* Effect.makeSemaphore(1);
  const unmappedScanRunning = yield* Ref.make(false);

  const downloadOrchestration = makeDownloadOrchestration({
    db,
    dbError,
    eventBus,
    fs,
    maybeQBitConfig,
    qbitClient,
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
    triggerSemaphore,
  });

  const coalescedDownloadProgressPublisher = yield* makeCoalescedEffectRunner(
    downloadOrchestration.publishDownloadProgress(),
  );
  const publishDownloadProgress = () =>
    coalescedDownloadProgressPublisher.trigger;
  const libraryScanProgressPublisher = yield* makeLatestValuePublisher(
    (scanned: number) =>
      eventBus.publish({
        type: "LibraryScanProgress",
        payload: { scanned },
      }),
  );
  const rssCheckProgressPublisher = yield* makeLatestValuePublisher(
    (payload: { current: number; total: number; feed_name: string }) =>
      eventBus.publish({
        type: "RssCheckProgress",
        payload,
      }),
  );

  const searchOrchestration = makeSearchOrchestration({
    aniList,
    db,
    dbError,
    eventBus,
    fs,
    maybeQBitConfig,
    publishDownloadProgress,
    publishRssCheckProgress: rssCheckProgressPublisher.offer,
    qbitClient,
    rssClient,
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
    publishDownloadProgress,
    publishLibraryScanProgress: libraryScanProgressPublisher.offer,
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
    getUnmappedFolders,
    runUnmappedScan,
    importUnmappedFolder,
    scanImportPath,
    importFiles,
    listDownloadQueue,
    listDownloadHistory,
    getDownloadProgress,
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
  } satisfies
    & RssServiceShape
    & LibraryServiceShape
    & DownloadServiceShape
    & SearchServiceShape;
});

const internalLayer = Layer.scoped(
  InternalOperationsService,
  makeOperationsService,
);

export const OperationsServiceLive = Layer.mergeAll(
  Layer.effect(RssService, Effect.map(InternalOperationsService, (s) => s)),
  Layer.effect(LibraryService, Effect.map(InternalOperationsService, (s) => s)),
  Layer.effect(
    DownloadService,
    Effect.map(InternalOperationsService, (s) => s),
  ),
  Layer.effect(SearchService, Effect.map(InternalOperationsService, (s) => s)),
).pipe(Layer.provide(internalLayer));
