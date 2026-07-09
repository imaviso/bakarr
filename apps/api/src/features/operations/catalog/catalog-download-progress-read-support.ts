import { desc, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { loadActiveDownloadSnapshot } from "@/features/operations/download/download-progress-support.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import type { StoredDataError } from "@/features/errors.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export interface DownloadRuntimeSummary {
  readonly active_count: number;
}

export function makeCatalogDownloadProgressReads(input: {
  readonly db: AppDatabase;
  readonly tryDatabasePromise: TryDatabasePromise;
}) {
  const { db, tryDatabasePromise } = input;

  const listActiveRows = (limit?: number) =>
    tryDatabasePromise("Failed to build download progress snapshot", () => {
      const query = db
        .select()
        .from(downloads)
        .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
        .orderBy(desc(downloads.id));
      return limit === undefined ? query : query.limit(limit);
    });

  const getDownloadProgress = Effect.fn("OperationsService.getDownloadProgress")(function* () {
    return yield* loadActiveDownloadSnapshot({
      listRows: () => listActiveRows(),
      loadContexts: (rows) => loadDownloadPresentationContexts(db, rows),
    });
  });

  const getDownloadProgressBootstrap = Effect.fn("OperationsService.getDownloadProgressBootstrap")(
    function* (input: { limit?: number } = {}) {
      const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
      return yield* loadActiveDownloadSnapshot({
        listRows: () => listActiveRows(limit),
        loadContexts: (rows) => loadDownloadPresentationContexts(db, rows),
      });
    },
  );

  const getDownloadRuntimeSummary = Effect.fn("OperationsService.getDownloadRuntimeSummary")(
    function* () {
      const countRows = yield* tryDatabasePromise("Failed to count active downloads", () =>
        db
          .select({ count: sql<number>`count(*)` })
          .from(downloads)
          .where(inArray(downloads.status, ["queued", "downloading", "paused"])),
      );

      return {
        active_count: countRows[0]?.count ?? 0,
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
