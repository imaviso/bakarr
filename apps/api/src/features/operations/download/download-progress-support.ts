import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { toDownloadStatus } from "@/features/operations/download/download-presentation.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { DownloadProgressRepository } from "@/features/operations/repository/download-progress-repository.ts";

export interface DownloadProgressSupportShape {
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
}

export interface DownloadProgressSupportInput {
  readonly downloadProgressRepository: typeof DownloadProgressRepository.Service;
  readonly eventBus: typeof EventBus.Service;
}

export function makeDownloadProgressSupport(input: DownloadProgressSupportInput) {
  const { downloadProgressRepository, eventBus } = input;

  const getDownloadProgressSnapshotEffect = Effect.fn(
    "OperationsService.getDownloadProgressSnapshot",
  )(function* () {
    const rows = yield* downloadProgressRepository.listActiveDownloadRows();
    const contexts = yield* downloadProgressRepository.loadPresentationContexts(rows);
    return yield* Effect.forEach(rows, (row) => toDownloadStatus(row, contexts.get(row.id)));
  });

  const publishDownloadProgress = Effect.fn("OperationsService.publishDownloadProgress")(
    function* () {
      const downloads = yield* getDownloadProgressSnapshotEffect().pipe(
        Effect.mapError((error) =>
          error instanceof DatabaseError
            ? error
            : new OperationsInfrastructureError({
                message: "Failed to load download progress snapshot",
                cause: error,
              }),
        ),
      );

      return yield* eventBus.publish({
        type: "DownloadProgress",
        payload: { downloads },
      });
    },
  );

  return {
    publishDownloadProgress,
  };
}

export class DownloadProgressSupport extends Effect.Service<DownloadProgressSupport>()(
  "@bakarr/api/DownloadProgressSupport",
  {
    effect: Effect.gen(function* () {
      const downloadProgressRepository = yield* DownloadProgressRepository;
      const eventBus = yield* EventBus;

      return makeDownloadProgressSupport({
        downloadProgressRepository,
        eventBus,
      });
    }),
  },
) {}

export const DownloadProgressSupportLive = DownloadProgressSupport.Default;
