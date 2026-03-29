import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { makeCatalogDownloadOrchestration } from "./catalog-download-orchestration.ts";
import type { OperationsError, OperationsInfrastructureError } from "./errors.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";

export function makeCatalogDownloadRuntime(input: {
  readonly applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => Effect.Effect<void, OperationsError | import("../../db/database.ts").DatabaseError>;
  readonly currentTimeMillis: () => Effect.Effect<number>;
  readonly db: AppDatabase;
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    import("../../db/database.ts").DatabaseError | OperationsInfrastructureError
  >;
  readonly reconcileDownloadByIdEffect: (
    id: number,
  ) => Effect.Effect<void, OperationsError | import("../../db/database.ts").DatabaseError>;
  readonly retryDownloadById: (
    id: number,
  ) => Effect.Effect<void, OperationsError | import("../../db/database.ts").DatabaseError>;
  readonly syncDownloadState: (
    trigger: string,
  ) => Effect.Effect<
    void,
    import("../../db/database.ts").DatabaseError | OperationsInfrastructureError
  >;
  readonly tryDatabasePromise: TryDatabasePromise;
}) {
  const nowIso = () =>
    input.currentTimeMillis().pipe(Effect.map((value) => new Date(value).toISOString()));

  return makeCatalogDownloadOrchestration({
    applyDownloadActionEffect: input.applyDownloadActionEffect,
    db: input.db,
    nowIso,
    publishDownloadProgress: input.publishDownloadProgress,
    reconcileDownloadByIdEffect: input.reconcileDownloadByIdEffect,
    retryDownloadById: input.retryDownloadById,
    syncDownloadState: input.syncDownloadState,
    tryDatabasePromise: input.tryDatabasePromise,
  });
}
