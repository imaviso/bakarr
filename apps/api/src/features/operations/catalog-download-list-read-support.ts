import { desc, lt, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { Download, DownloadHistoryPage } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { toDownload } from "@/features/operations/download-presentation.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export function makeCatalogDownloadListReads(input: {
  readonly db: AppDatabase;
  readonly tryDatabasePromise: TryDatabasePromise;
}) {
  const { db, tryDatabasePromise } = input;

  const listDownloadQueue = Effect.fn("OperationsService.listDownloadQueue")(function* () {
    const rows = yield* tryDatabasePromise("Failed to list download queue", () =>
      db
        .select()
        .from(downloads)
        .where(sql`${downloads.status} in ('queued', 'downloading', 'paused')`)
        .orderBy(desc(downloads.id)),
    );
    const contexts = yield* loadDownloadPresentationContexts(db, rows);
    return yield* Effect.forEach(rows, (row) => toDownload(row, contexts.get(row.id)));
  });

  const listDownloadHistory = Effect.fn("OperationsService.listDownloadHistory")(function* (
    queryInput: { cursor?: string; limit?: number } = {},
  ) {
    const limit = Math.max(1, Math.min(queryInput.limit ?? 200, 1000));
    const cursorId =
      queryInput.cursor && /^\d+$/.test(queryInput.cursor) ? Number(queryInput.cursor) : undefined;
    const query = db
      .select()
      .from(downloads)
      .orderBy(desc(downloads.id))
      .limit(limit + 1);
    const rows = yield* tryDatabasePromise("Failed to list download history", () =>
      cursorId ? query.where(lt(downloads.id, cursorId)) : query,
    );
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const contexts = yield* loadDownloadPresentationContexts(db, pageRows);
    const mappedRows = yield* Effect.forEach(pageRows, (row) =>
      toDownload(row, contexts.get(row.id)),
    );
    const countRows = yield* tryDatabasePromise("Failed to count download history", () =>
      db.select({ count: sql<number>`count(*)` }).from(downloads),
    );
    const total = countRows[0]?.count ?? 0;
    const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.id : undefined;

    return {
      downloads: mappedRows,
      has_more: hasMore,
      limit,
      next_cursor: nextCursor ? String(nextCursor) : undefined,
      total,
    } satisfies DownloadHistoryPage;
  });

  return {
    listDownloadHistory,
    listDownloadQueue,
  } satisfies {
    readonly listDownloadHistory: (input?: {
      readonly cursor?: string;
      readonly limit?: number;
    }) => Effect.Effect<DownloadHistoryPage, DatabaseError | OperationsStoredDataError>;
    readonly listDownloadQueue: () => Effect.Effect<
      Download[],
      DatabaseError | OperationsStoredDataError
    >;
  };
}
