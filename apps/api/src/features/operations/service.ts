import { Context, Effect, Layer } from "effect";

import type {
  CalendarEvent,
  Config,
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
import { type QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import { RssClient } from "./rss-client.ts";
import { makeSearchOrchestration } from "./search-orchestration.ts";
import { makeDownloadOrchestration } from "./download-orchestration.ts";
import { makeCatalogOrchestration } from "./catalog-orchestration.ts";

export {
  applyRemotePathMappings,
  inferCoveredEpisodeNumbers,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
} from "./download-lifecycle.ts";
import { OperationsError } from "./errors.ts";

export interface OperationsServiceShape {
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
  readonly runRssCheck: () => Effect.Effect<
    { newItems: number },
    DatabaseError
  >;
  readonly runLibraryScan: () => Effect.Effect<
    { matched: number; scanned: number },
    DatabaseError
  >;
}

export class OperationsService
  extends Context.Tag("@bakarr/api/OperationsService")<
    OperationsService,
    OperationsServiceShape
  >() {}

const makeOperationsService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const aniList = yield* AniListClient;
  const qbitClient = yield* QBitTorrentClient;
  const rssClient = yield* RssClient;
  const maybeQBitConfig = (config: Config): QBitConfig | null => {
    if (!config.qbittorrent.enabled || !config.qbittorrent.password) {
      return null;
    }

    return {
      baseUrl: config.qbittorrent.url,
      category: config.qbittorrent.default_category,
      password: config.qbittorrent.password,
      username: config.qbittorrent.username,
    };
  };

  const downloadOrchestration = makeDownloadOrchestration({
    db,
    dbError,
    eventBus,
    maybeQBitConfig,
    qbitClient,
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
  });

  const searchOrchestration = makeSearchOrchestration({
    aniList,
    db,
    dbError,
    eventBus,
    maybeQBitConfig,
    publishDownloadProgress: downloadOrchestration.publishDownloadProgress,
    qbitClient,
    rssClient,
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
  });

  const {
    applyDownloadActionEffect,
    publishDownloadProgress,
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
    publishDownloadProgress,
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
  } satisfies OperationsServiceShape;
});

export const OperationsServiceLive = Layer.effect(
  OperationsService,
  makeOperationsService,
);

function dbError(message: string) {
  return (cause: unknown) => new DatabaseError({ cause, message });
}

function wrapOperationsError(message: string) {
  return (cause: unknown) => {
    if (cause instanceof OperationsError || cause instanceof DatabaseError) {
      return cause;
    }
    return new DatabaseError({ cause, message });
  };
}

function tryDatabasePromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: dbError(message),
  });
}

function tryOperationsPromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, OperationsError | DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: wrapOperationsError(message),
  });
}
