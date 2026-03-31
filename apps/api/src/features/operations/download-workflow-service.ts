import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { RandomService } from "@/lib/random.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { maybeQBitConfig } from "@/features/operations/operations-qbit-config.ts";
import { makeDownloadProgressSupport } from "@/features/operations/download-progress-support.ts";
import { makeDownloadOrchestration } from "@/features/operations/download-orchestration.ts";
import { makeDownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { makeDownloadTorrentLifecycleService } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { makeDownloadTriggerService } from "@/features/operations/download-trigger-service.ts";
import {
  OperationsSharedState,
  OperationsSharedStateLive,
} from "@/features/operations/runtime-support.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type DownloadWorkflowShape = ReturnType<typeof makeDownloadOrchestration>;

export class DownloadWorkflow extends Context.Tag("@bakarr/api/DownloadWorkflow")<
  DownloadWorkflow,
  DownloadWorkflowShape
>() {}

const makeDownloadWorkflowService = Effect.gen(function* () {
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

  const progressSupport = makeDownloadProgressSupport({
    db,
    eventBus,
    syncDownloadsWithQBitEffect: torrentLifecycleService.syncDownloadsWithQBitEffect,
    tryDatabasePromise,
  });

  const triggerService = makeDownloadTriggerService({
    coordination: sharedState,
    db,
    eventBus,
    maybeQBitConfig,
    nowIso: () => nowIsoFromClock(clock),
    qbitClient,
    publishDownloadProgress: progressSupport.publishDownloadProgress,
    tryDatabasePromise,
  });

  return makeDownloadOrchestration({
    currentMonotonicMillis: () => clock.currentMonotonicMillis,
    reconciliationService,
    progressSupport,
    torrentLifecycleService,
    triggerService,
  });
});

export const DownloadWorkflowLive = Layer.effect(
  DownloadWorkflow,
  makeDownloadWorkflowService,
).pipe(Layer.provideMerge(OperationsSharedStateLive));
