import { desc, inArray } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, type AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { toDownloadStatus } from "@/features/operations/download-presentation.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { tryDatabasePromise, type TryDatabasePromise } from "@/infra/effect/db.ts";

export interface DownloadProgressSupportShape {
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
}

export class DownloadProgressSupport extends Context.Tag("@bakarr/api/DownloadProgressSupport")<
  DownloadProgressSupport,
  DownloadProgressSupportShape
>() {}

export interface DownloadProgressSupportInput {
  readonly db: AppDatabase;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
}

export function makeDownloadProgressSupport(input: DownloadProgressSupportInput) {
  const { db, eventBus, tryDatabasePromise } = input;

  const getDownloadProgressSnapshotEffect = Effect.fn(
    "OperationsService.getDownloadProgressSnapshot",
  )(function* () {
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

export const DownloadProgressSupportLive = Layer.effect(
  DownloadProgressSupport,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;

    return makeDownloadProgressSupport({
      db,
      eventBus,
      tryDatabasePromise,
    });
  }),
);
