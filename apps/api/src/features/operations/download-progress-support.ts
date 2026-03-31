import { desc, inArray } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import { toDownloadStatus } from "@/features/operations/repository/download-repository.ts";
import {
  type OperationsError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export interface DownloadProgressSupportInput {
  readonly db: AppDatabase;
  readonly eventBus: typeof EventBus.Service;
  readonly syncDownloadsWithQBitEffect: () => Effect.Effect<
    void,
    ExternalCallError | OperationsError | DatabaseError
  >;
  readonly tryDatabasePromise: TryDatabasePromise;
}

export function makeDownloadProgressSupport(input: DownloadProgressSupportInput) {
  const { db, eventBus, syncDownloadsWithQBitEffect, tryDatabasePromise } = input;

  const getDownloadProgressSnapshotEffect = Effect.fn(
    "OperationsService.getDownloadProgressSnapshot",
  )(function* () {
    yield* syncDownloadsWithQBitEffect();
    const rows = yield* tryDatabasePromise("Failed to load download progress snapshot", () =>
      db
        .select()
        .from(downloads)
        .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
        .orderBy(desc(downloads.id)),
    );
    const contexts = yield* loadDownloadPresentationContexts(db, rows);
    return yield* Effect.forEach(rows, (row) => toDownloadStatus(row, contexts.get(row.id)));
  });

  const publishDownloadProgress = Effect.fn("OperationsService.publishDownloadProgress")(
    function* () {
      const downloads = yield* getDownloadProgressSnapshotEffect().pipe(
        Effect.catchAll((error) =>
          Effect.fail(
            error instanceof DatabaseError
              ? error
              : new OperationsInfrastructureError({
                  message: "Failed to load download progress snapshot",
                  cause: error,
                }),
          ),
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
