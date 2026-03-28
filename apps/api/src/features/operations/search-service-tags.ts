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

export type SearchWorkflowShape = ReturnType<typeof makeSearchOrchestration>;

export class SearchWorkflow extends Context.Tag("@bakarr/api/SearchWorkflow")<
  SearchWorkflow,
  SearchWorkflowShape
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

export const SearchWorkflowLive = Layer.effect(SearchWorkflow, makeSearchWorkflow);
