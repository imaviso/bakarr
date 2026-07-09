import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import type { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { toDownloadStatus } from "@/features/operations/download/download-presentation.ts";
import { InfrastructureError, type StoredDataError } from "@/features/errors.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";

type DownloadRow = typeof downloads.$inferSelect;

export interface DownloadProgressSupportShape {
  readonly publishDownloadProgress: () => Effect.Effect<void, DatabaseError | InfrastructureError>;
}

export const loadActiveDownloadSnapshot = Effect.fn("OperationsService.loadActiveDownloadSnapshot")(
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
      const downloadProgressRepository = yield* DownloadRepository;
      const eventBus = yield* EventBus;

      const getDownloadProgressSnapshotEffect = Effect.fn(
        "OperationsService.getDownloadProgressSnapshot",
      )(function* () {
        return yield* loadActiveDownloadSnapshot({
          listRows: () => downloadProgressRepository.listActiveDownloadRows(),
          loadContexts: (rows) => downloadProgressRepository.loadPresentationContexts(rows),
        });
      });

      const publishDownloadProgress = Effect.fn("OperationsService.publishDownloadProgress")(
        function* () {
          const activeDownloads = yield* getDownloadProgressSnapshotEffect().pipe(
            Effect.mapError((error) =>
              error instanceof DatabaseError
                ? error
                : new InfrastructureError({
                    message: "Failed to load download progress snapshot",
                    cause: error,
                  }),
            ),
          );

          return yield* eventBus.publish({
            type: "DownloadProgress",
            payload: { downloads: activeDownloads },
          });
        },
      );

      return {
        publishDownloadProgress,
      } satisfies DownloadProgressSupportShape;
    }),
    dependencies: [DownloadRepository.Default],
  },
) {}

export const DownloadProgressSupportLive = DownloadProgressSupport.Default;
