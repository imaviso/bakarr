import { Effect, Scope } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { type StoredDataError } from "@/features/errors.ts";
import { toDownloadStatus } from "@/features/operations/download/download-presentation.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { makeOperationsProgressPublishers } from "@/features/operations/tasks/operations-progress-publishers.ts";

type DownloadRow = typeof downloads.$inferSelect;
type ProgressError = DatabaseError | StoredDataError;

export const loadActiveDownloadSnapshot = Effect.fn(
  "OperationsProgress.loadActiveDownloadSnapshot",
)(function* (input: {
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
});

export interface OperationsProgressShape {
  readonly getDownloadProgress: () => Effect.Effect<DownloadStatus[], ProgressError>;
  readonly getDownloadProgressBootstrap: (input?: {
    readonly limit?: number;
  }) => Effect.Effect<DownloadStatus[], ProgressError>;
  readonly getDownloadRuntimeSummary: () => Effect.Effect<
    { readonly active_count: number },
    DatabaseError
  >;
  /** Coalesced (workers / background). */
  readonly publishDownloadProgress: () => Effect.Effect<void, ProgressError>;
  /** Immediate (sync / trigger / action / reconcile). */
  readonly publishDownloadProgressNow: () => Effect.Effect<void, ProgressError>;
  readonly publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  readonly publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
}

export class OperationsProgress extends Effect.Service<OperationsProgress>()(
  "@bakarr/api/OperationsProgress",
  {
    dependencies: [DownloadRepository.Default, EventBus.Default],
    scoped: Effect.gen(function* () {
      yield* Scope.Scope;
      const eventBus = yield* EventBus;
      const downloadRepository = yield* DownloadRepository;

      const getDownloadProgress = Effect.fn("OperationsProgress.getDownloadProgress")(function* () {
        return yield* loadActiveDownloadSnapshot({
          listRows: () => downloadRepository.listActiveDownloadRows(),
          loadContexts: (rows) => downloadRepository.loadPresentationContexts(rows),
        });
      });

      const getDownloadProgressBootstrap = Effect.fn(
        "OperationsProgress.getDownloadProgressBootstrap",
      )(function* (input: { limit?: number } = {}) {
        const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
        return yield* loadActiveDownloadSnapshot({
          listRows: () => downloadRepository.listActiveDownloadRows(limit),
          loadContexts: (rows) => downloadRepository.loadPresentationContexts(rows),
        });
      });

      const getDownloadRuntimeSummary = Effect.fn("OperationsProgress.getDownloadRuntimeSummary")(
        function* () {
          return {
            active_count: yield* downloadRepository.countActiveDownloads(),
          };
        },
      );

      const publishDownloadProgressNow = Effect.fn("OperationsProgress.publishDownloadProgressNow")(
        function* () {
          const activeDownloads = yield* getDownloadProgress();
          return yield* eventBus.publish({
            type: "DownloadProgress",
            payload: { downloads: activeDownloads },
          });
        },
      );

      const publishers = yield* makeOperationsProgressPublishers({
        eventBus,
        publishDownloadProgressEffect: publishDownloadProgressNow(),
      });

      return {
        getDownloadProgress,
        getDownloadProgressBootstrap,
        getDownloadRuntimeSummary,
        publishDownloadProgress: publishers.publishDownloadProgress,
        publishDownloadProgressNow,
        publishLibraryScanProgress: publishers.publishLibraryScanProgress,
        publishRssCheckProgress: publishers.publishRssCheckProgress,
      } satisfies OperationsProgressShape;
    }),
  },
) {}

export const OperationsProgressLive = OperationsProgress.Default;
