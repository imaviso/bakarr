import { Context, Effect, Layer } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { makeCatalogDownloadViewSupport } from "@/features/operations/catalog-download-view-support.ts";
import {
  OperationsSharedState,
  OperationsSharedStateLive,
} from "@/features/operations/runtime-support.ts";
import { makeOperationsProgressPublishers } from "@/features/operations/operations-progress-publishers.ts";
import type { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { RandomService } from "@/lib/random.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { maybeQBitConfig } from "@/features/operations/operations-qbit-config.ts";
import { makeDownloadOrchestration } from "@/features/operations/download-orchestration.ts";
import { makeDownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { makeDownloadTorrentLifecycleService } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { makeDownloadTriggerService } from "@/features/operations/download-trigger-service.ts";
import { toDatabaseError } from "@/lib/effect-db.ts";

export class DownloadWorkflow extends Context.Tag("@bakarr/api/DownloadWorkflow")<
  DownloadWorkflow,
  ReturnType<typeof makeDownloadOrchestration>
>() {}

const DownloadWorkflowBaseLive = Layer.effect(
  DownloadWorkflow,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const qbitClient = yield* QBitTorrentClient;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;
    const clock = yield* ClockService;
    const random = yield* RandomService;
    const sharedState = yield* OperationsSharedState;

    const reconciliationService = makeDownloadReconciliationService({
      db,
      eventBus,
      fs,
      mediaProbe,
      maybeQBitConfig,
      nowIso: () => nowIsoFromClock(clock),
      qbitClient,
      randomUuid: () => random.randomUuid,
      tryDatabasePromise,
    });

    const torrentLifecycleService = makeDownloadTorrentLifecycleService({
      db,
      maybeQBitConfig,
      qbitClient,
      nowIso: () => nowIsoFromClock(clock),
      reconcileCompletedTorrentEffect: reconciliationService.reconcileCompletedTorrentEffect,
      tryDatabasePromise,
    });

    const triggerService = makeDownloadTriggerService({
      coordination: sharedState,
      db,
      dbError: toDatabaseError,
      eventBus,
      maybeQBitConfig,
      nowIso: () => nowIsoFromClock(clock),
      qbitClient,
      syncDownloadsWithQBitEffect: torrentLifecycleService.syncDownloadsWithQBitEffect,
      tryDatabasePromise,
    });

    return makeDownloadOrchestration({
      currentMonotonicMillis: () => clock.currentMonotonicMillis,
      reconciliationService,
      torrentLifecycleService,
      triggerService,
    });
  }),
);

export interface DownloadProgressServiceShape {
  readonly getDownloadProgress: () => Effect.Effect<
    DownloadStatus[],
    DatabaseError | OperationsStoredDataError
  >;
}

export class DownloadProgressService extends Context.Tag("@bakarr/api/DownloadProgressService")<
  DownloadProgressService,
  DownloadProgressServiceShape
>() {}

const makeDownloadProgressService = Effect.gen(function* () {
  const { db } = yield* Database;
  const clock = yield* ClockService;
  const readSupport = makeCatalogDownloadViewSupport({
    db,
    nowIso: () => nowIsoFromClock(clock),
    tryDatabasePromise,
  });

  return {
    getDownloadProgress: readSupport.getDownloadProgress,
  } satisfies DownloadProgressServiceShape;
});

export const DownloadProgressServiceLive = Layer.effect(
  DownloadProgressService,
  makeDownloadProgressService,
);

export interface OperationsProgressShape {
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
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

export const ProgressLive = Layer.scoped(
  OperationsProgress,
  Effect.gen(function* () {
    const eventBus = yield* EventBus;
    const downloadWorkflow = yield* DownloadWorkflow;

    return yield* makeOperationsProgressPublishers({
      eventBus,
      publishDownloadProgressEffect: downloadWorkflow.publishDownloadProgress(),
    });
  }),
);

export const DownloadWorkflowLive = DownloadWorkflowBaseLive.pipe(
  Layer.provideMerge(OperationsSharedStateLive),
);
