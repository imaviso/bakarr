import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import {
  DownloadWorkflow,
  OperationsProgress,
} from "@/features/operations/download-service-tags.ts";
import { makeCatalogDownloadOrchestration } from "@/features/operations/catalog-download-orchestration.ts";

export type CatalogDownloadServiceShape = ReturnType<typeof makeCatalogDownloadOrchestration>;

export class CatalogDownloadService extends Context.Tag("@bakarr/api/CatalogDownloadService")<
  CatalogDownloadService,
  CatalogDownloadServiceShape
>() {}

const makeCatalogDownloadService = Effect.gen(function* () {
  const { db } = yield* Database;
  const downloadWorkflow = yield* DownloadWorkflow;
  const progress = yield* OperationsProgress;
  const clock = yield* ClockService;

  return makeCatalogDownloadOrchestration({
    applyDownloadActionEffect: downloadWorkflow.applyDownloadActionEffect,
    db,
    reconcileDownloadByIdEffect: downloadWorkflow.reconcileDownloadByIdEffect,
    retryDownloadById: downloadWorkflow.retryDownloadById,
    syncDownloadState: downloadWorkflow.syncDownloadState,
    nowIso: () => nowIsoFromClock(clock),
    publishDownloadProgress: progress.publishDownloadProgress,
    tryDatabasePromise,
  });
});

export const CatalogDownloadServiceLive = Layer.effect(
  CatalogDownloadService,
  makeCatalogDownloadService,
);
