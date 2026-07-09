import { Effect } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { loadActiveDownloadSnapshot } from "@/features/operations/download/download-progress-support.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import type { StoredDataError } from "@/features/errors.ts";

export interface DownloadRuntimeSummary {
  readonly active_count: number;
}

export function makeCatalogDownloadProgressReads(
  downloadRepository: typeof DownloadRepository.Service,
) {
  const getDownloadProgress = Effect.fn("OperationsService.getDownloadProgress")(function* () {
    return yield* loadActiveDownloadSnapshot({
      listRows: () => downloadRepository.listActiveDownloadRows(),
      loadContexts: (rows) => downloadRepository.loadPresentationContexts(rows),
    });
  });

  const getDownloadProgressBootstrap = Effect.fn("OperationsService.getDownloadProgressBootstrap")(
    function* (input: { limit?: number } = {}) {
      const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
      return yield* loadActiveDownloadSnapshot({
        listRows: () => downloadRepository.listActiveDownloadRows(limit),
        loadContexts: (rows) => downloadRepository.loadPresentationContexts(rows),
      });
    },
  );

  const getDownloadRuntimeSummary = Effect.fn("OperationsService.getDownloadRuntimeSummary")(
    function* () {
      return {
        active_count: yield* downloadRepository.countActiveDownloads(),
      } satisfies DownloadRuntimeSummary;
    },
  );

  return {
    getDownloadProgress,
    getDownloadProgressBootstrap,
    getDownloadRuntimeSummary,
  } satisfies {
    readonly getDownloadProgress: () => Effect.Effect<
      DownloadStatus[],
      DatabaseError | StoredDataError
    >;
    readonly getDownloadProgressBootstrap: (input?: {
      readonly limit?: number;
    }) => Effect.Effect<DownloadStatus[], DatabaseError | StoredDataError>;
    readonly getDownloadRuntimeSummary: () => Effect.Effect<DownloadRuntimeSummary, DatabaseError>;
  };
}
