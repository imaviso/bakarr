/**
 * Internal orchestration tags and layers for the operations feature.
 *
 * These are implementation-level building blocks consumed only by the service
 * live layers (rss/library/download/search-service-live.ts) and by the
 * operations-runtime-layer.ts composition entry-point.
 *
 * Nothing outside features/operations/ should import from this module.
 */

import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
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
import { makeSearchOrchestration } from "./search-orchestration.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { RssClient } from "./rss-client.ts";
import { SeaDexClient } from "./seadex-client.ts";
import { maybeQBitConfig, wrapOperationsError } from "./service-support.ts";
import { tryDatabasePromise, toDatabaseError } from "../../lib/effect-db.ts";
import { makeOperationsProgressPublishers, makeOperationsSharedState } from "./runtime-support.ts";
import type { DatabaseError } from "../../db/database.ts";

// ---------------------------------------------------------------------------
// Shared state — serializes exclusive access for scan + download triggers
// ---------------------------------------------------------------------------

export interface OperationsSharedStateShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: (loop: Effect.Effect<void>) => Effect.Effect<void>;
  readonly runExclusiveDownloadTrigger: <A, E>(
    operation: Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>;
  readonly tryBeginUnmappedScan: () => Effect.Effect<boolean>;
}

export class OperationsSharedState extends Context.Tag("@bakarr/api/OperationsSharedState")<
  OperationsSharedState,
  OperationsSharedStateShape
>() {}

export const OperationsSharedStateLive = Layer.scoped(
  OperationsSharedState,
  makeOperationsSharedState(),
);

// ---------------------------------------------------------------------------
// Progress publishers — fan-out to EventBus
// ---------------------------------------------------------------------------

export interface OperationsProgressShape {
  readonly publishDownloadProgress: () => Effect.Effect<void, DatabaseError>;
  readonly publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  readonly publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
}

export class OperationsProgress extends Context.Tag("@bakarr/api/OperationsProgress")<
  OperationsProgress,
  OperationsProgressShape
>() {}

// ---------------------------------------------------------------------------
// Download orchestration
// ---------------------------------------------------------------------------

export type DownloadOrchestrationShape = ReturnType<typeof makeDownloadOrchestration>;

export class DownloadOrchestration extends Context.Tag("@bakarr/api/DownloadOrchestration")<
  DownloadOrchestration,
  DownloadOrchestrationShape
>() {}

export const DownloadOrchestrationLive = Layer.effect(
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
      dbError: toDatabaseError,
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

export const ProgressLive = Layer.scoped(
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

// ---------------------------------------------------------------------------
// Search orchestration
// ---------------------------------------------------------------------------

export type SearchOrchestrationShape = ReturnType<typeof makeSearchOrchestration>;

export class SearchOrchestration extends Context.Tag("@bakarr/api/SearchOrchestration")<
  SearchOrchestration,
  SearchOrchestrationShape
>() {}

export const SearchOrchestrationLive = Layer.effect(
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
      coordination: sharedState,
      tryDatabasePromise,
      wrapOperationsError,
    });
  }),
);

// ---------------------------------------------------------------------------
// Catalog orchestration
// ---------------------------------------------------------------------------

export type CatalogOrchestrationShape = ReturnType<typeof makeCatalogOrchestration>;

export class CatalogOrchestration extends Context.Tag("@bakarr/api/CatalogOrchestration")<
  CatalogOrchestration,
  CatalogOrchestrationShape
>() {}

export class CatalogLibraryReadSupport extends Context.Tag("@bakarr/api/CatalogLibraryReadSupport")<
  CatalogLibraryReadSupport,
  CatalogLibraryReadSupportShape
>() {}

export const CatalogLibraryReadSupportLive = Layer.effect(
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

export const CatalogOrchestrationLive = Layer.effect(
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
      dbError: toDatabaseError,
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
