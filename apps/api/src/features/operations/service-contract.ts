import { Context, Effect } from "effect";

import type {
  CalendarEvent,
  Download,
  DownloadEventsExport,
  DownloadEventsPage,
  DownloadSourceMetadata,
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
import { DatabaseError } from "../../db/database.ts";
import type { OperationsError } from "./errors.ts";

export interface RssServiceShape {
  readonly listRssFeeds: () => Effect.Effect<RssFeed[], DatabaseError>;
  readonly listAnimeRssFeeds: (animeId: number) => Effect.Effect<RssFeed[], DatabaseError>;
  readonly addRssFeed: (input: {
    anime_id: number;
    url: string;
    name?: string;
  }) => Effect.Effect<RssFeed, OperationsError | DatabaseError>;
  readonly deleteRssFeed: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly toggleRssFeed: (id: number, enabled: boolean) => Effect.Effect<void, DatabaseError>;
  readonly runRssCheck: () => Effect.Effect<{ newItems: number }, DatabaseError>;
}

export interface LibraryServiceShape {
  readonly getWantedMissing: (limit: number) => Effect.Effect<MissingEpisode[], DatabaseError>;
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
  readonly getUnmappedFolders: () => Effect.Effect<ScannerState, OperationsError | DatabaseError>;
  readonly runUnmappedScan: () => Effect.Effect<
    { folderCount: number },
    OperationsError | DatabaseError
  >;
  readonly controlUnmappedFolder: (input: {
    action: "pause" | "resume" | "reset" | "refresh";
    path: string;
  }) => Effect.Effect<{ folderCount: number; folderPath: string }, OperationsError | DatabaseError>;
  readonly bulkControlUnmappedFolders: (input: {
    action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed";
  }) => Effect.Effect<{ affectedCount: number }, OperationsError | DatabaseError>;
  readonly importUnmappedFolder: (input: {
    folder_name: string;
    anime_id: number;
    profile_name?: string;
  }) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly scanImportPath: (
    path: string,
    animeId?: number,
  ) => Effect.Effect<ScanResult, OperationsError | DatabaseError>;
  readonly importFiles: (
    files: readonly {
      source_path: string;
      anime_id: number;
      episode_number: number;
      episode_numbers?: readonly number[];
      season?: number;
      source_metadata?: DownloadSourceMetadata;
    }[],
  ) => Effect.Effect<ImportResult, DatabaseError>;
  readonly runLibraryScan: () => Effect.Effect<
    { matched: number; scanned: number },
    OperationsError | DatabaseError
  >;
}

export interface DownloadServiceShape {
  readonly listDownloadQueue: () => Effect.Effect<Download[], OperationsError | DatabaseError>;
  readonly listDownloadHistory: () => Effect.Effect<Download[], OperationsError | DatabaseError>;
  readonly getDownloadProgress: () => Effect.Effect<
    DownloadStatus[],
    OperationsError | DatabaseError
  >;
  readonly pauseDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly resumeDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly removeDownload: (
    id: number,
    deleteFiles: boolean,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly retryDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly reconcileDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly syncDownloads: () => Effect.Effect<void, DatabaseError>;
  readonly listDownloadEvents: (input?: {
    readonly animeId?: number;
    readonly cursor?: string;
    readonly downloadId?: number;
    readonly direction?: "next" | "prev";
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<DownloadEventsPage, OperationsError | DatabaseError>;
  readonly exportDownloadEvents: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<DownloadEventsExport, OperationsError | DatabaseError>;
  readonly triggerDownload: (input: {
    anime_id: number;
    magnet: string;
    episode_number?: number;
    title: string;
    group?: string;
    info_hash?: string;
    is_batch?: boolean;
    decision_reason?: string;
    release_metadata?: DownloadSourceMetadata;
  }) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly triggerSearchMissing: (animeId?: number) => Effect.Effect<void, DatabaseError>;
}

export interface SearchServiceShape {
  readonly searchReleases: (
    query: string,
    animeId?: number,
    category?: string,
    filter?: string,
  ) => Effect.Effect<SearchResults, OperationsError | DatabaseError>;
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
