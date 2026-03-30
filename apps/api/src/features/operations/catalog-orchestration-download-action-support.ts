import { Effect } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import type {
  OperationsError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";

export interface CatalogDownloadActionSupportShape {
  readonly pauseDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly reconcileDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly removeDownload: (
    id: number,
    deleteFiles: boolean,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly resumeDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly retryDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly syncDownloads: () => Effect.Effect<
    void,
    DatabaseError | OperationsError | OperationsInfrastructureError
  >;
}

export function makeCatalogDownloadActionSupport(input: {
  applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  publishDownloadProgress: () => Effect.Effect<void, DatabaseError | OperationsInfrastructureError>;
  reconcileDownloadByIdEffect: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  retryDownloadById: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  syncDownloadState: (trigger: string) => Effect.Effect<void, DatabaseError | OperationsError>;
}) {
  const {
    applyDownloadActionEffect,
    publishDownloadProgress,
    reconcileDownloadByIdEffect,
    retryDownloadById,
    syncDownloadState,
  } = input;

  const pauseDownload = Effect.fn("OperationsService.pauseDownload")(function* (id: number) {
    yield* applyDownloadActionEffect(id, "pause");
  });

  const resumeDownload = Effect.fn("OperationsService.resumeDownload")(function* (id: number) {
    yield* applyDownloadActionEffect(id, "resume");
  });

  const removeDownload = Effect.fn("OperationsService.removeDownload")(function* (
    id: number,
    deleteFiles: boolean,
  ) {
    yield* applyDownloadActionEffect(id, "delete", deleteFiles);
  });

  const retryDownload = Effect.fn("OperationsService.retryDownload")(function* (id: number) {
    yield* retryDownloadById(id);
    yield* publishDownloadProgress();
  });

  const reconcileDownload = Effect.fn("OperationsService.reconcileDownload")(function* (
    id: number,
  ) {
    yield* reconcileDownloadByIdEffect(id);
    yield* publishDownloadProgress();
  });

  const syncDownloads = Effect.fn("OperationsService.syncDownloads")(function* () {
    yield* syncDownloadState("downloads.manual_sync");
    yield* publishDownloadProgress();
  });

  return {
    pauseDownload,
    reconcileDownload,
    removeDownload,
    resumeDownload,
    retryDownload,
    syncDownloads,
  } satisfies CatalogDownloadActionSupportShape;
}
