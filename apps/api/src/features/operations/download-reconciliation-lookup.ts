import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  type OperationsError,
} from "@/features/operations/errors.ts";

export function makeReconcileDownloadByIdEffect(input: {
  readonly db: AppDatabase;
  readonly reconcileCompletedTorrentEffect: (
    infoHash: string,
    contentPath: string | undefined,
  ) => Effect.Effect<void, ExternalCallError | OperationsError | DatabaseError>;
  readonly tryDatabasePromise: TryDatabasePromise;
}) {
  const { db, reconcileCompletedTorrentEffect, tryDatabasePromise } = input;

  return Effect.fn("OperationsService.reconcileDownloadById")(function* (id: number) {
    const rows = yield* tryDatabasePromise("Failed to reconcile download", () =>
      db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
    );
    const [row] = rows;

    if (!row) {
      return yield* new DownloadNotFoundError({
        message: "Download not found",
      });
    }

    const contentPath = row.contentPath ?? row.savePath;

    if (!contentPath || !row.infoHash) {
      return yield* new DownloadConflictError({
        message: "Download has no reconciliable content path",
      });
    }

    yield* reconcileCompletedTorrentEffect(row.infoHash, contentPath ?? undefined);
  });
}
