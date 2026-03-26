import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "../../db/database.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import { RandomService } from "../../lib/random.ts";
import { AniListClient } from "../anime/anilist.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  type CatalogLibraryReadSupportShape,
  makeCatalogLibraryReadSupport,
} from "./catalog-library-read-support.ts";
import { makeCatalogOrchestration } from "./catalog-orchestration.ts";
import { makeDownloadOrchestration } from "./download-orchestration.ts";
import {
  DownloadService,
  type DownloadServiceShape,
  LibraryService,
  type LibraryServiceShape,
  RssService,
  type RssServiceShape,
  SearchService,
  type SearchServiceShape,
} from "./service-contract.ts";
import {
  dbError,
  maybeQBitConfig,
  tryDatabasePromise,
  wrapOperationsError,
} from "./service-support.ts";
import { makeOperationsProgressPublishers, makeOperationsSharedState } from "./runtime-support.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { RssClient } from "./rss-client.ts";
import { SeaDexClient } from "./seadex-client.ts";
import { makeSearchOrchestration } from "./search-orchestration.ts";

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

interface OperationsSharedStateShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: (loop: Effect.Effect<void>) => Effect.Effect<void>;
  readonly runExclusiveDownloadTrigger: <A, E>(
    operation: Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>;
  readonly tryBeginUnmappedScan: () => Effect.Effect<boolean>;
}

interface OperationsProgressShape {
  readonly publishDownloadProgress: () => Effect.Effect<void, DatabaseError>;
  readonly publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  readonly publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
}

type DownloadOrchestrationShape = ReturnType<typeof makeDownloadOrchestration>;
type SearchOrchestrationShape = ReturnType<typeof makeSearchOrchestration>;
type CatalogOrchestrationShape = ReturnType<typeof makeCatalogOrchestration>;

class OperationsSharedState extends Context.Tag("@bakarr/api/OperationsSharedState")<
  OperationsSharedState,
  OperationsSharedStateShape
>() {}

class OperationsProgress extends Context.Tag("@bakarr/api/OperationsProgress")<
  OperationsProgress,
  OperationsProgressShape
>() {}

class DownloadOrchestration extends Context.Tag("@bakarr/api/DownloadOrchestration")<
  DownloadOrchestration,
  DownloadOrchestrationShape
>() {}

class SearchOrchestration extends Context.Tag("@bakarr/api/SearchOrchestration")<
  SearchOrchestration,
  SearchOrchestrationShape
>() {}

class CatalogOrchestration extends Context.Tag("@bakarr/api/CatalogOrchestration")<
  CatalogOrchestration,
  CatalogOrchestrationShape
>() {}

class CatalogLibraryReadSupport extends Context.Tag("@bakarr/api/CatalogLibraryReadSupport")<
  CatalogLibraryReadSupport,
  CatalogLibraryReadSupportShape
>() {}

function projectServiceEffect<Args extends ReadonlyArray<unknown>, Success, Error>(
  name: string,
  effect: (...args: Args) => Effect.Effect<Success, Error>,
): (...args: Args) => Effect.Effect<Success, Error> {
  return Effect.fn(name)(function* (...args: Args) {
    return yield* effect(...args);
  });
}

const operationsSharedStateLayer = Layer.scoped(OperationsSharedState, makeOperationsSharedState());

const downloadOrchestrationLayer = Layer.effect(
  DownloadOrchestration,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const qbitClient = yield* QBitTorrentClient;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;
    const clock = yield* ClockService;
    const random = yield* RandomService;
    const sharedState = yield* OperationsSharedState;

    return makeDownloadOrchestration({
      db,
      dbError,
      eventBus,
      fs,
      mediaProbe,
      maybeQBitConfig,
      currentMonotonicMillis: () => clock.currentMonotonicMillis,
      currentTimeMillis: () => clock.currentTimeMillis,
      nowIso: () => nowIsoFromClock(clock),
      qbitClient,
      randomUuid: () => random.randomUuid,
      tryDatabasePromise,

      wrapOperationsError,
      coordination: sharedState,
    });
  }),
);

const downloadRuntimeLayer = downloadOrchestrationLayer.pipe(
  Layer.provide(operationsSharedStateLayer),
);

const operationsProgressLayer = Layer.scoped(
  OperationsProgress,
  Effect.gen(function* () {
    const eventBus = yield* EventBus;
    const downloadOrchestration = yield* DownloadOrchestration;

    return yield* makeOperationsProgressPublishers({
      eventBus,
      publishDownloadProgressEffect: downloadOrchestration.publishDownloadProgress(),
    });
  }),
);

const progressRuntimeLayer = operationsProgressLayer.pipe(Layer.provide(downloadRuntimeLayer));

const searchOrchestrationLayer = Layer.effect(
  SearchOrchestration,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const aniList = yield* AniListClient;
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
      db,
      dbError,
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
      coordination: sharedState,
      tryDatabasePromise,
      wrapOperationsError,
    });
  }),
);

const searchRuntimeLayer = searchOrchestrationLayer.pipe(
  Layer.provide(Layer.mergeAll(operationsSharedStateLayer, progressRuntimeLayer)),
);

const catalogLibraryReadSupportLayer = Layer.effect(
  CatalogLibraryReadSupport,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;

    return makeCatalogLibraryReadSupport({
      currentTimeMillis: () => clock.currentTimeMillis,
      db,
      tryDatabasePromise,
    });
  }),
);

const catalogOrchestrationLayer = Layer.effect(
  CatalogOrchestration,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;
    const clock = yield* ClockService;
    const downloadOrchestration = yield* DownloadOrchestration;
    const progress = yield* OperationsProgress;
    const libraryReadSupport = yield* CatalogLibraryReadSupport;

    return makeCatalogOrchestration({
      applyDownloadActionEffect: downloadOrchestration.applyDownloadActionEffect,
      db,
      dbError,
      eventBus,
      fs,
      mediaProbe,
      nowIso: () => nowIsoFromClock(clock),
      publishDownloadProgress: progress.publishDownloadProgress,
      publishLibraryScanProgress: progress.publishLibraryScanProgress,
      reconcileDownloadByIdEffect: downloadOrchestration.reconcileDownloadByIdEffect,
      retryDownloadById: downloadOrchestration.retryDownloadById,
      syncDownloadState: downloadOrchestration.syncDownloadState,
      tryDatabasePromise,

      libraryReadSupport,
    });
  }),
);

const catalogRuntimeLayer = catalogOrchestrationLayer.pipe(
  Layer.provide(
    Layer.mergeAll(downloadRuntimeLayer, progressRuntimeLayer, catalogLibraryReadSupportLayer),
  ),
);

const rssServiceProjectionLayer = Layer.effect(
  RssService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;

    return {
      addRssFeed: projectServiceEffect("RssService.addRssFeed", catalog.addRssFeed),
      deleteRssFeed: projectServiceEffect("RssService.deleteRssFeed", catalog.deleteRssFeed),
      listAnimeRssFeeds: projectServiceEffect(
        "RssService.listAnimeRssFeeds",
        catalog.listAnimeRssFeeds,
      ),
      listRssFeeds: projectServiceEffect("RssService.listRssFeeds", catalog.listRssFeeds),
      runRssCheck: projectServiceEffect("RssService.runRssCheck", search.runRssCheck),
      toggleRssFeed: projectServiceEffect("RssService.toggleRssFeed", catalog.toggleRssFeed),
    } satisfies RssServiceShape;
  }),
);

const libraryServiceProjectionLayer = Layer.effect(
  LibraryService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;

    return {
      bulkControlUnmappedFolders: projectServiceEffect(
        "LibraryService.bulkControlUnmappedFolders",
        search.bulkControlUnmappedFolders,
      ),
      controlUnmappedFolder: projectServiceEffect(
        "LibraryService.controlUnmappedFolder",
        search.controlUnmappedFolder,
      ),
      getCalendar: projectServiceEffect("LibraryService.getCalendar", catalog.getCalendar),
      getRenamePreview: projectServiceEffect(
        "LibraryService.getRenamePreview",
        catalog.getRenamePreview,
      ),
      getUnmappedFolders: projectServiceEffect(
        "LibraryService.getUnmappedFolders",
        search.getUnmappedFolders,
      ),
      getWantedMissing: projectServiceEffect(
        "LibraryService.getWantedMissing",
        catalog.getWantedMissing,
      ),
      importFiles: projectServiceEffect("LibraryService.importFiles", catalog.importFiles),
      importUnmappedFolder: projectServiceEffect(
        "LibraryService.importUnmappedFolder",
        search.importUnmappedFolder,
      ),
      renameFiles: projectServiceEffect("LibraryService.renameFiles", catalog.renameFiles),
      runLibraryScan: projectServiceEffect("LibraryService.runLibraryScan", catalog.runLibraryScan),
      runUnmappedScan: projectServiceEffect(
        "LibraryService.runUnmappedScan",
        search.runUnmappedScan,
      ),
      scanImportPath: projectServiceEffect("LibraryService.scanImportPath", search.scanImportPath),
    } satisfies LibraryServiceShape;
  }),
);

const downloadServiceProjectionLayer = Layer.effect(
  DownloadService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;
    const download = yield* DownloadOrchestration;

    return {
      exportDownloadEvents: projectServiceEffect(
        "DownloadService.exportDownloadEvents",
        catalog.exportDownloadEvents,
      ),
      getDownloadProgress: projectServiceEffect(
        "DownloadService.getDownloadProgress",
        catalog.getDownloadProgress,
      ),
      listDownloadEvents: projectServiceEffect(
        "DownloadService.listDownloadEvents",
        catalog.listDownloadEvents,
      ),
      listDownloadHistory: projectServiceEffect(
        "DownloadService.listDownloadHistory",
        catalog.listDownloadHistory,
      ),
      listDownloadQueue: projectServiceEffect(
        "DownloadService.listDownloadQueue",
        catalog.listDownloadQueue,
      ),
      pauseDownload: projectServiceEffect("DownloadService.pauseDownload", catalog.pauseDownload),
      reconcileDownload: projectServiceEffect(
        "DownloadService.reconcileDownload",
        catalog.reconcileDownload,
      ),
      removeDownload: projectServiceEffect(
        "DownloadService.removeDownload",
        catalog.removeDownload,
      ),
      resumeDownload: projectServiceEffect(
        "DownloadService.resumeDownload",
        catalog.resumeDownload,
      ),
      retryDownload: projectServiceEffect("DownloadService.retryDownload", catalog.retryDownload),
      syncDownloads: projectServiceEffect("DownloadService.syncDownloads", catalog.syncDownloads),
      triggerDownload: projectServiceEffect(
        "DownloadService.triggerDownload",
        download.triggerDownload,
      ),
      triggerSearchMissing: projectServiceEffect(
        "DownloadService.triggerSearchMissing",
        search.triggerSearchMissing,
      ),
    } satisfies DownloadServiceShape;
  }),
);

const searchServiceProjectionLayer = Layer.effect(
  SearchService,
  Effect.gen(function* () {
    const search = yield* SearchOrchestration;

    return {
      searchEpisode: projectServiceEffect("SearchService.searchEpisode", search.searchEpisode),
      searchReleases: projectServiceEffect("SearchService.searchReleases", search.searchReleases),
    } satisfies SearchServiceShape;
  }),
);

const projectedServicesLayer = Layer.mergeAll(
  rssServiceProjectionLayer,
  libraryServiceProjectionLayer,
  downloadServiceProjectionLayer,
  searchServiceProjectionLayer,
);

const orchestrationLayer = Layer.mergeAll(
  downloadRuntimeLayer,
  progressRuntimeLayer,
  searchRuntimeLayer,
  catalogRuntimeLayer,
);

export const OperationsServiceLive = projectedServicesLayer.pipe(Layer.provide(orchestrationLayer));
