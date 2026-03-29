import { Effect } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { RandomService } from "@/lib/random.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { makeDownloadOrchestration } from "@/features/operations/download-orchestration.ts";
import { makeDownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { makeDownloadTorrentLifecycleService } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { makeDownloadTriggerService } from "@/features/operations/download-trigger-service.ts";
import { OperationsSharedState } from "@/features/operations/runtime-support.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { maybeQBitConfig } from "@/features/operations/operations-qbit-config.ts";
import { tryDatabasePromise, toDatabaseError } from "@/lib/effect-db.ts";

export type DownloadWorkflowShape = ReturnType<typeof makeDownloadOrchestration>;

export const makeDownloadWorkflowRuntime = Effect.fn("DownloadWorkflowRuntime")(function* () {
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
});
