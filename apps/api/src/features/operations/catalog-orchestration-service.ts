import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService, nowIsoFromClock } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import { EventBus } from "../events/event-bus.ts";
import { makeCatalogOrchestration } from "./catalog-orchestration.ts";
import { DownloadOrchestration } from "./download-orchestration-service.ts";
import { OperationsProgress } from "./operations-progress.ts";
import { CatalogLibraryReadSupport } from "./catalog-library-read-support-service.ts";
import { tryDatabasePromise, toDatabaseError } from "../../lib/effect-db.ts";

export type CatalogOrchestrationShape = ReturnType<typeof makeCatalogOrchestration>;

export class CatalogOrchestration extends Context.Tag("@bakarr/api/CatalogOrchestration")<
  CatalogOrchestration,
  CatalogOrchestrationShape
>() {}

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
