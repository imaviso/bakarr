import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AniListClient } from "../anime/anilist.ts";
import { AnimeImportService } from "../anime/import-service.ts";
import { EventBus } from "../events/event-bus.ts";
import { RssClient } from "./rss-client.ts";
import { SeaDexClient } from "./seadex-client.ts";
import { makeBackgroundSearchSupport } from "./background-search-support.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { makeSearchEpisodeSupport } from "./search-orchestration-episode-support.ts";
import { makeSearchImportPathSupport } from "./search-orchestration-import-path-support.ts";
import { type OperationsError } from "./errors.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import { makeUnmappedOrchestrationSupport } from "./unmapped-orchestration-support.ts";
import type { OperationsCoordinationShape } from "./runtime-support.ts";
import { makeSearchReleaseSupport } from "./search-orchestration-release-search.ts";

export function makeSearchOrchestration(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  aniList: typeof AniListClient.Service;
  animeImportService: typeof AnimeImportService.Service;
  rssClient: typeof RssClient.Service;
  seadexClient: typeof SeaDexClient.Service;
  qbitClient: typeof QBitTorrentClient.Service;
  eventBus: typeof EventBus.Service;
  tryDatabasePromise: TryDatabasePromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  maybeQBitConfig: (config: Config) => QBitConfig | null;
  nowIso: () => Effect.Effect<string>;
  publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | import("./errors.ts").OperationsInfrastructureError
  >;
  publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
  coordination: OperationsCoordinationShape;
}) {
  const {
    db,
    fs,
    mediaProbe,
    aniList,
    animeImportService,
    rssClient,
    seadexClient,
    qbitClient,
    eventBus,
    tryDatabasePromise,
    wrapOperationsError,
    dbError,
    maybeQBitConfig,
    publishDownloadProgress,
    publishRssCheckProgress,
    coordination,
  } = input;
  const { nowIso } = input;

  const { searchEpisodeReleases, searchNyaaReleases, searchReleases } = makeSearchReleaseSupport({
    db,
    rssClient,
    seadexClient,
    wrapOperationsError,
  });
  const backgroundSearchSupport = makeBackgroundSearchSupport({
    db,
    eventBus,
    maybeQBitConfig,
    nowIso,
    publishDownloadProgress,
    publishRssCheckProgress,
    qbitClient,
    rssClient,
    searchEpisodeReleases,
    coordination,
    tryDatabasePromise,
    wrapOperationsError,
  });

  const { runRssCheck, triggerSearchMissing } = backgroundSearchSupport;
  const unmappedOrchestrationSupport = makeUnmappedOrchestrationSupport({
    aniList,
    animeImportService,
    db,
    dbError,
    fs,
    nowIso,
    tryDatabasePromise,
    coordination,
  });

  const {
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
    getUnmappedFolders,
    importUnmappedFolder,
    runUnmappedScan,
  } = unmappedOrchestrationSupport;
  const { searchEpisode } = makeSearchEpisodeSupport({
    db,
    searchEpisodeReleases,
    wrapOperationsError,
  });
  const { scanImportPath } = makeSearchImportPathSupport({
    aniList,
    db,
    fs,
    mediaProbe,
    tryDatabasePromise,
  });

  return {
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
    getUnmappedFolders,
    importUnmappedFolder,
    runRssCheck,
    runUnmappedScan,
    scanImportPath,
    searchEpisode,
    searchEpisodeReleases,
    searchNyaaReleases,
    searchReleases,
    triggerSearchMissing,
  };
}
