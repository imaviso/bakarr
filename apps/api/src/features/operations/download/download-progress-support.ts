import { Effect } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { toDownloadStatus } from "@/features/operations/download/download-presentation.ts";
import type { StoredDataError } from "@/features/errors.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";

type DownloadRow = typeof downloads.$inferSelect;
type ProgressError = DatabaseError | StoredDataError;

export interface DownloadProgressSupportShape {
  readonly getDownloadProgress: () => Effect.Effect<DownloadStatus[], ProgressError>;
  readonly getDownloadProgressBootstrap: (input?: {
    readonly limit?: number;
  }) => Effect.Effect<DownloadStatus[], ProgressError>;
  readonly getDownloadRuntimeSummary: () => Effect.Effect<
    { readonly active_count: number },
    DatabaseError
  >;
  readonly publishDownloadProgress: () => Effect.Effect<void, ProgressError>;
}

export const loadActiveDownloadSnapshot = Effect.fn("DownloadProgress.loadActiveDownloadSnapshot")(
  function* (input: {
    readonly listRows: () => Effect.Effect<readonly DownloadRow[], DatabaseError>;
    readonly loadContexts: (
      rows: readonly DownloadRow[],
    ) => Effect.Effect<
      ReadonlyMap<number, DownloadPresentationContext> | Map<number, DownloadPresentationContext>,
      DatabaseError | StoredDataError
    >;
  }) {
    const rows = yield* input.listRows();
    const contexts = yield* input.loadContexts(rows);
    return yield* Effect.forEach(rows, (row) => toDownloadStatus(row, contexts.get(row.id)));
  },
);

export class DownloadProgressSupport extends Effect.Service<DownloadProgressSupport>()(
  "@bakarr/api/DownloadProgressSupport",
  {
    effect: Effect.gen(function* () {
      const downloadRepository = yield* DownloadRepository;
      const eventBus = yield* EventBus;

      const getDownloadProgress = Effect.fn("DownloadProgress.getDownloadProgress")(function* () {
        return yield* loadActiveDownloadSnapshot({
          listRows: () => downloadRepository.listActiveDownloadRows(),
          loadContexts: (rows) => downloadRepository.loadPresentationContexts(rows),
        });
      });

      const getDownloadProgressBootstrap = Effect.fn(
        "DownloadProgress.getDownloadProgressBootstrap",
      )(function* (input: { limit?: number } = {}) {
        const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
        return yield* loadActiveDownloadSnapshot({
          listRows: () => downloadRepository.listActiveDownloadRows(limit),
          loadContexts: (rows) => downloadRepository.loadPresentationContexts(rows),
        });
      });

      const getDownloadRuntimeSummary = Effect.fn("DownloadProgress.getDownloadRuntimeSummary")(
        function* () {
          return {
            active_count: yield* downloadRepository.countActiveDownloads(),
          };
        },
      );

      const publishDownloadProgress = Effect.fn("DownloadProgress.publishDownloadProgress")(
        function* () {
          const activeDownloads = yield* getDownloadProgress();

          return yield* eventBus.publish({
            type: "DownloadProgress",
            payload: { downloads: activeDownloads },
          });
        },
      );

      return {
        getDownloadProgress,
        getDownloadProgressBootstrap,
        getDownloadRuntimeSummary,
        publishDownloadProgress,
      } satisfies DownloadProgressSupportShape;
    }),
    dependencies: [DownloadRepository.Default],
  },
) {}

export const DownloadProgressSupportLive = DownloadProgressSupport.Default;
