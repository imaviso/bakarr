import { Context, Effect, Layer } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import type { DatabaseError } from "@/db/database.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { makeCatalogDownloadViewSupport } from "@/features/operations/catalog-download-view-support.ts";
import { OperationsSharedStateLive } from "@/features/operations/runtime-support.ts";
import { makeOperationsProgressPublishers } from "@/features/operations/operations-progress-publishers.ts";
import {
  makeDownloadWorkflowRuntime,
  type DownloadWorkflowShape,
} from "@/features/operations/download-workflow-runtime.ts";
import type { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";

export class DownloadWorkflow extends Context.Tag("@bakarr/api/DownloadWorkflow")<
  DownloadWorkflow,
  DownloadWorkflowShape
>() {}

const DownloadWorkflowBaseLive = Layer.effect(DownloadWorkflow, makeDownloadWorkflowRuntime());

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
