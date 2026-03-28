import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import { EventBus } from "../events/event-bus.ts";
import { DownloadWorkflow } from "./download-service-tags.ts";
import { OperationsProgress } from "./operations-progress.ts";
import { CatalogLibraryReadSupport } from "./catalog-library-read-support-service.ts";
import { makeCatalogOrchestration } from "./catalog-orchestration.ts";
import { tryDatabasePromise, toDatabaseError } from "../../lib/effect-db.ts";

export type CatalogWorkflowShape = ReturnType<typeof makeCatalogOrchestration>;

export class CatalogWorkflow extends Context.Tag("@bakarr/api/CatalogWorkflow")<
  CatalogWorkflow,
  CatalogWorkflowShape
>() {}

const makeCatalogWorkflow = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const clock = yield* ClockService;
  const downloadWorkflow = yield* DownloadWorkflow;
  const progress = yield* OperationsProgress;
  const libraryReadSupport = yield* CatalogLibraryReadSupport;

  return makeCatalogOrchestration({
    applyDownloadActionEffect: downloadWorkflow.applyDownloadActionEffect,
    db,
    dbError: toDatabaseError,
    eventBus,
    fs,
    mediaProbe,
    nowIso: () =>
      clock.currentTimeMillis.pipe(Effect.map((value) => new Date(value).toISOString())),
    publishDownloadProgress: progress.publishDownloadProgress,
    publishLibraryScanProgress: progress.publishLibraryScanProgress,
    reconcileDownloadByIdEffect: downloadWorkflow.reconcileDownloadByIdEffect,
    retryDownloadById: downloadWorkflow.retryDownloadById,
    syncDownloadState: downloadWorkflow.syncDownloadState,
    tryDatabasePromise,
    libraryReadSupport,
  });
});

export const CatalogWorkflowLive = Layer.effect(CatalogWorkflow, makeCatalogWorkflow);
