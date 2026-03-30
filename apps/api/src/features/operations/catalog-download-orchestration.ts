import type { AppDatabase } from "@/db/database.ts";
import { makeCatalogDownloadActionSupport } from "@/features/operations/catalog-orchestration-download-action-support.ts";
import { makeCatalogDownloadViewSupport } from "@/features/operations/catalog-download-view-support.ts";
import { makeCatalogRssSupport } from "@/features/operations/catalog-rss-support.ts";
import type { OperationsError } from "@/features/operations/errors.ts";

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
