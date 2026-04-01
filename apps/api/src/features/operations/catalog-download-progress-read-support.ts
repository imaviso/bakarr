import { desc, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import { toDownloadStatus } from "@/features/operations/repository/download-repository.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export interface DownloadRuntimeSummary {
  readonly active_count: number;
}

export function makeCatalogDownloadProgressReads(input: {
  readonly db: AppDatabase;
  readonly tryDatabasePromise: TryDatabasePromise;
}) {
  const { db, tryDatabasePromise } = input;

  const getDownloadProgress = Effect.fn("OperationsService.getDownloadProgress")(function* () {
    const rows = yield* tryDatabasePromise("Failed to build download progress snapshot", () =>
      db
        .select()
        .from(downloads)
        .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
        .orderBy(desc(downloads.id)),
    );
    const contexts = yield* loadDownloadPresentationContexts(db, rows);
    return yield* Effect.forEach(rows, (row) => toDownloadStatus(row, contexts.get(row.id)));
  });

  const getDownloadProgressBootstrap = Effect.fn(
    "OperationsService.getDownloadProgressBootstrap",
  )(function* (input: { limit?: number } = {}) {
    const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
    const rows = yield* tryDatabasePromise("Failed to build download progress snapshot", () =>
      db
        .select()
        .from(downloads)
        .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
        .orderBy(desc(downloads.id))
        .limit(limit),
    );
    const contexts = yield* loadDownloadPresentationContexts(db, rows);
    return yield* Effect.forEach(rows, (row) => toDownloadStatus(row, contexts.get(row.id)));
  });

  const getDownloadRuntimeSummary = Effect.fn("OperationsService.getDownloadRuntimeSummary")(
    function* () {
      const countRows = yield* tryDatabasePromise("Failed to count active downloads", () =>
        db
          .select({ count: sql<number>`count(*)` })
          .from(downloads)
          .where(inArray(downloads.status, ["queued", "downloading", "paused"])),
      );

      return {
        active_count: Number(countRows[0]?.count ?? 0),
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
      DatabaseError | OperationsStoredDataError
    >;
    readonly getDownloadProgressBootstrap: (input?: {
      readonly limit?: number;
    }) => Effect.Effect<DownloadStatus[], DatabaseError | OperationsStoredDataError>;
    readonly getDownloadRuntimeSummary: () => Effect.Effect<DownloadRuntimeSummary, DatabaseError>;
  };
}
