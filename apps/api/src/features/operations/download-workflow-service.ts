import { Context, Effect, Layer } from "effect";

import { ClockService } from "@/lib/clock.ts";
import { DownloadProgressSupport } from "@/features/operations/download-progress-support.ts";
import { DownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { DownloadTorrentLifecycleService } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { DownloadTriggerService } from "@/features/operations/download-trigger-coordinator-service.ts";
import {
  makeDownloadOrchestration,
  type DownloadWorkflowShape,
} from "@/features/operations/download-orchestration.ts";

export class DownloadWorkflow extends Context.Tag("@bakarr/api/DownloadWorkflow")<
  DownloadWorkflow,
  DownloadWorkflowShape
>() {}

const makeDownloadWorkflowService = Effect.gen(function* () {
  const clock = yield* ClockService;
  const reconciliationService = yield* DownloadReconciliationService;
  const torrentLifecycleService = yield* DownloadTorrentLifecycleService;
  const progressSupport = yield* DownloadProgressSupport;
  const triggerService = yield* DownloadTriggerService;

  return makeDownloadOrchestration({
    currentMonotonicMillis: () => clock.currentMonotonicMillis,
    reconciliationService,
    progressSupport,
    torrentLifecycleService,
    triggerService,
  });
});

export const DownloadWorkflowLive = Layer.effect(DownloadWorkflow, makeDownloadWorkflowService);
