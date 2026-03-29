import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService } from "../../lib/clock.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { DownloadWorkflow, OperationsProgress } from "./download-service-tags.ts";
import { makeCatalogDownloadRuntime } from "./catalog-download-runtime.ts";

export type CatalogDownloadServiceShape = ReturnType<typeof makeCatalogDownloadRuntime>;

export class CatalogDownloadService extends Context.Tag("@bakarr/api/CatalogDownloadService")<
  CatalogDownloadService,
  CatalogDownloadServiceShape
>() {}

const makeCatalogDownloadService = Effect.gen(function* () {
  const { db } = yield* Database;
  const downloadWorkflow = yield* DownloadWorkflow;
  const progress = yield* OperationsProgress;
  const clock = yield* ClockService;

  return makeCatalogDownloadRuntime({
    applyDownloadActionEffect: downloadWorkflow.applyDownloadActionEffect,
    currentTimeMillis: () => clock.currentTimeMillis,
    db,
    publishDownloadProgress: progress.publishDownloadProgress,
    reconcileDownloadByIdEffect: downloadWorkflow.reconcileDownloadByIdEffect,
    retryDownloadById: downloadWorkflow.retryDownloadById,
    syncDownloadState: downloadWorkflow.syncDownloadState,
    tryDatabasePromise,
  });
});

export const CatalogDownloadServiceLive = Layer.effect(
  CatalogDownloadService,
  makeCatalogDownloadService,
);
