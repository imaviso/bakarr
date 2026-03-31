import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import type { AppDatabase } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { makeCatalogDownloadActionSupport } from "@/features/operations/catalog-orchestration-download-action-support.ts";
import { makeCatalogDownloadViewSupport } from "@/features/operations/catalog-download-view-support.ts";
import { makeCatalogRssSupport } from "@/features/operations/catalog-rss-support.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { DownloadWorkflow } from "@/features/operations/download-workflow-service.ts";
import { OperationsProgress } from "@/features/operations/operations-progress-service.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export function makeCatalogDownloadOrchestration(input: {
  readonly applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => import("effect").Effect.Effect<
    void,
    import("./errors.ts").OperationsError | import("@/db/database.ts").DatabaseError
  >;
  readonly db: AppDatabase;
  readonly nowIso: () => import("effect").Effect.Effect<string>;
  readonly publishDownloadProgress: () => import("effect").Effect.Effect<
    void,
    import("@/db/database.ts").DatabaseError | import("./errors.ts").OperationsInfrastructureError
  >;
  readonly reconcileDownloadByIdEffect: (
    id: number,
  ) => import("effect").Effect.Effect<
    void,
    import("./errors.ts").OperationsError | import("@/db/database.ts").DatabaseError
  >;
  readonly retryDownloadById: (
    id: number,
  ) => import("effect").Effect.Effect<
    void,
    import("./errors.ts").OperationsError | import("@/db/database.ts").DatabaseError
  >;
  readonly syncDownloadState: (
    trigger: string,
  ) => import("effect").Effect.Effect<
    void,
    import("@/db/database.ts").DatabaseError | OperationsError
  >;
  readonly tryDatabasePromise: import("@/lib/effect-db.ts").TryDatabasePromise;
}) {
  const {
    applyDownloadActionEffect,
    db,
    nowIso,
    publishDownloadProgress,
    reconcileDownloadByIdEffect,
    retryDownloadById,
    syncDownloadState,
    tryDatabasePromise,
  } = input;

  const downloadActionSupport = makeCatalogDownloadActionSupport({
    applyDownloadActionEffect,
    publishDownloadProgress,
    reconcileDownloadByIdEffect,
    retryDownloadById,
    syncDownloadState,
  });
  const downloadViewSupport = makeCatalogDownloadViewSupport({
    db,
    nowIso,
    tryDatabasePromise,
  });
  const rssSupport = makeCatalogRssSupport({
    db,
    nowIso,
    tryDatabasePromise,
  });

  return {
    ...downloadActionSupport,
    ...downloadViewSupport,
    ...rssSupport,
  };
}

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
