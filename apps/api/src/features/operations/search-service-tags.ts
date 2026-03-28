import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService, nowIsoFromClock } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import { AniListClient } from "../anime/anilist.ts";
import { AnimeImportService } from "../anime/import-service.ts";
import { EventBus } from "../events/event-bus.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { RssClient } from "./rss-client.ts";
import { SeaDexClient } from "./seadex-client.ts";
import { maybeQBitConfig, wrapOperationsError } from "./service-support.ts";
import { tryDatabasePromise, toDatabaseError } from "../../lib/effect-db.ts";
import { makeSearchOrchestration } from "./search-orchestration.ts";
import { OperationsProgress } from "./operations-progress.ts";
import { OperationsSharedState } from "./operations-shared-state.ts";
import type {
  EpisodeSearchResult,
  ScanResult,
  SearchResults,
} from "../../../../../packages/shared/src/index.ts";
import type { DatabaseError } from "../../db/database.ts";
import type { ExternalCallError } from "../../lib/effect-retry.ts";
import type { OperationsError } from "./errors.ts";
import type { UnmappedControlWorkflowShape } from "./unmapped-orchestration-control.ts";
import type { UnmappedImportWorkflowShape } from "./unmapped-orchestration-import.ts";
import type { UnmappedScanQueryShape } from "./unmapped-orchestration-scan-query.ts";
import type { UnmappedScanWorkflowShape } from "./unmapped-orchestration-scan.ts";

type SearchServiceError = ExternalCallError | OperationsError | DatabaseError;

export interface SearchQueryServiceShape {
  readonly searchEpisode: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<readonly EpisodeSearchResult[], SearchServiceError>;
  readonly searchReleases: (
    query: string,
    animeId?: number,
    category?: string,
    filter?: string,
  ) => Effect.Effect<SearchResults, SearchServiceError>;
}

export class SearchQueryService extends Context.Tag("@bakarr/api/SearchQueryService")<
  SearchQueryService,
  SearchQueryServiceShape
>() {}

export const makeSearchWorkflow = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const aniList = yield* AniListClient;
  const animeImportService = yield* AnimeImportService;
  const qbitClient = yield* QBitTorrentClient;
  const rssClient = yield* RssClient;
  const seadexClient = yield* SeaDexClient;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const clock = yield* ClockService;
  const sharedState = yield* OperationsSharedState;
  const progress = yield* OperationsProgress;

  return makeSearchOrchestration({
    aniList,
    animeImportService,
    coordination: sharedState,
    db,
    dbError: toDatabaseError,
    eventBus,
    fs,
    mediaProbe,
    maybeQBitConfig,
    nowIso: () => nowIsoFromClock(clock),
    publishDownloadProgress: progress.publishDownloadProgress,
    publishRssCheckProgress: progress.publishRssCheckProgress,
    qbitClient,
    rssClient,
    seadexClient,
    tryDatabasePromise,
    wrapOperationsError,
  });
});

export const SearchQueryServiceLive = Layer.effect(
  SearchQueryService,
  Effect.gen(function* () {
    const search = yield* makeSearchWorkflow;

    return {
      searchEpisode: search.searchEpisode,
      searchReleases: search.searchReleases,
    };
  }),
);

export interface UnmappedFolderServiceShape {
  readonly bulkControlUnmappedFolders: UnmappedControlWorkflowShape["bulkControlUnmappedFolders"];
  readonly controlUnmappedFolder: UnmappedControlWorkflowShape["controlUnmappedFolder"];
  readonly getUnmappedFolders: UnmappedScanQueryShape["getUnmappedFolders"];
  readonly importUnmappedFolder: UnmappedImportWorkflowShape["importUnmappedFolder"];
  readonly runUnmappedScan: UnmappedScanWorkflowShape["runUnmappedScan"];
}

export class UnmappedFolderService extends Context.Tag("@bakarr/api/UnmappedFolderService")<
  UnmappedFolderService,
  UnmappedFolderServiceShape
>() {}

export const UnmappedFolderServiceLive = Layer.effect(
  UnmappedFolderService,
  Effect.gen(function* () {
    const search = yield* makeSearchWorkflow;

    return {
      bulkControlUnmappedFolders: search.bulkControlUnmappedFolders,
      controlUnmappedFolder: search.controlUnmappedFolder,
      getUnmappedFolders: search.getUnmappedFolders,
      importUnmappedFolder: search.importUnmappedFolder,
      runUnmappedScan: search.runUnmappedScan,
    };
  }),
);

export interface ImportPathScanServiceShape {
  readonly scanImportPath: (
    path: string,
    animeId?: number,
  ) => Effect.Effect<ScanResult, SearchServiceError>;
}

export class ImportPathScanService extends Context.Tag("@bakarr/api/ImportPathScanService")<
  ImportPathScanService,
  ImportPathScanServiceShape
>() {}

export const ImportPathScanServiceLive = Layer.effect(
  ImportPathScanService,
  Effect.gen(function* () {
    const search = yield* makeSearchWorkflow;

    return {
      scanImportPath: search.scanImportPath,
    };
  }),
);
