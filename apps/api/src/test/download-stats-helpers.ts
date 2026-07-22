import { eq, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

const countDownloadsWhere = Effect.fn("DownloadStatsHelpers.countDownloadsWhere")(function* (
  db: AppDatabase,
  condition: SQL,
) {
  const countRows = yield* tryDatabasePromise("Failed to count downloads", () =>
    db
      .select({ value: sql<number>`count(*)` })
      .from(downloads)
      .where(condition),
  );
  const countRow = countRows[0];

  if (!countRow) {
    return 0;
  }

  return countRow.value;
});

export const countQueuedDownloads = Effect.fn("DownloadStatsHelpers.countQueuedDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, eq(downloads.status, "queued"));
  },
);

export const countInProgressDownloads = Effect.fn("DownloadStatsHelpers.countInProgressDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, sql`${downloads.status} in ('downloading', 'paused')`);
  },
);

export const countFailedDownloads = Effect.fn("DownloadStatsHelpers.countFailedDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, eq(downloads.status, "error"));
  },
);

export const countImportedDownloads = Effect.fn("DownloadStatsHelpers.countImportedDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, eq(downloads.status, "imported"));
  },
);

export const countCompletedDownloads = Effect.fn("DownloadStatsHelpers.countCompletedDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, eq(downloads.status, "completed"));
  },
);
