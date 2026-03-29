import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { Effect } from "effect";

import type {
  Download,
  DownloadEventsExport,
  DownloadEventsPage,
  DownloadStatus,
} from "@packages/shared/index.ts";
import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { downloadEvents, downloads } from "@/db/schema.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import { toDownload, toDownloadStatus } from "@/features/operations/repository.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/lib/download-event-presentations.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export interface CatalogDownloadViewSupportShape {
  readonly listDownloadEvents: (input?: {
    readonly animeId?: number;
    readonly cursor?: string;
    readonly downloadId?: number;
    readonly direction?: "next" | "prev";
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<
    DownloadEventsPage,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly exportDownloadEvents: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<
    DownloadEventsExport,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly listDownloadQueue: () => Effect.Effect<
    Download[],
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly listDownloadHistory: () => Effect.Effect<
    Download[],
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly getDownloadProgress: () => Effect.Effect<
    DownloadStatus[],
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
}

type DownloadEventQueryInput = {
  animeId?: number;
  downloadId?: number;
  endDate?: string;
  eventType?: string;
  startDate?: string;
  status?: string;
};

function buildDownloadEventConditions(queryInput: DownloadEventQueryInput) {
  return [
    queryInput.animeId ? eq(downloadEvents.animeId, queryInput.animeId) : undefined,
    queryInput.downloadId ? eq(downloadEvents.downloadId, queryInput.downloadId) : undefined,
    queryInput.endDate ? lte(downloadEvents.createdAt, queryInput.endDate) : undefined,
    queryInput.eventType ? eq(downloadEvents.eventType, queryInput.eventType) : undefined,
    queryInput.startDate ? gte(downloadEvents.createdAt, queryInput.startDate) : undefined,
    queryInput.status
      ? or(
          eq(downloadEvents.fromStatus, queryInput.status),
          eq(downloadEvents.toStatus, queryInput.status),
        )
      : undefined,
  ].filter((value): value is Exclude<typeof value, undefined> => value !== undefined);
}

export function makeCatalogDownloadViewSupport(input: {
  db: AppDatabase;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}): CatalogDownloadViewSupportShape {
  const { nowIso } = input;
  const listDownloadEvents = Effect.fn("OperationsService.listDownloadEvents")(function* (
    queryInput: {
      animeId?: number;
      cursor?: string;
      downloadId?: number;
      direction?: "next" | "prev";
      endDate?: string;
      eventType?: string;
      limit?: number;
      startDate?: string;
      status?: string;
    } = {},
  ) {
    const limit = Math.max(1, Math.min(queryInput.limit ?? 100, 1000));
    const cursorId =
      queryInput.cursor && /^\d+$/.test(queryInput.cursor) ? Number(queryInput.cursor) : undefined;
    const baseConditions = buildDownloadEventConditions(queryInput);
    let cursorCondition;

    if (cursorId) {
      cursorCondition =
        queryInput.direction === "prev"
          ? gt(downloadEvents.id, cursorId)
          : lt(downloadEvents.id, cursorId);
    }
    const conditions = cursorCondition ? [...baseConditions, cursorCondition] : baseConditions;
    const query = input.db
      .select()
      .from(downloadEvents)
      .orderBy(queryInput.direction === "prev" ? asc(downloadEvents.id) : desc(downloadEvents.id))
      .limit(limit + 1);
    const rows = yield* input.tryDatabasePromise("Failed to load download events", () =>
      conditions.length > 0 ? query.where(and(...conditions)) : query,
    );
    const totalRows = yield* input.tryDatabasePromise("Failed to count download events", () => {
      const totalQuery = input.db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
      return baseConditions.length > 0 ? totalQuery.where(and(...baseConditions)) : totalQuery;
    });
    const hasExtraRow = rows.length > limit;
    const pageRows = hasExtraRow ? rows.slice(0, limit) : rows;
    const orderedRows = queryInput.direction === "prev" ? [...pageRows].reverse() : pageRows;
    const contexts = yield* loadDownloadEventPresentationContexts(input.db, orderedRows);
    const events = yield* Effect.forEach(orderedRows, (row) =>
      toDownloadEvent(row, contexts.get(row.id)),
    );
    const total = Number(totalRows[0]?.count ?? 0);
    const firstRowId = orderedRows[0]?.id;
    const lastRowId = orderedRows[orderedRows.length - 1]?.id;
    const newerExists = firstRowId
      ? yield* hasAdjacentDownloadEvent(
          input.db,
          input.tryDatabasePromise,
          baseConditions,
          gt(downloadEvents.id, firstRowId),
        )
      : false;
    const olderExists = lastRowId
      ? yield* hasAdjacentDownloadEvent(
          input.db,
          input.tryDatabasePromise,
          baseConditions,
          lt(downloadEvents.id, lastRowId),
        )
      : false;

    return {
      events,
      has_more: olderExists,
      limit,
      next_cursor: olderExists && lastRowId ? String(lastRowId) : undefined,
      prev_cursor: newerExists && firstRowId ? String(firstRowId) : undefined,
      total,
    } satisfies DownloadEventsPage;
  });

  const exportDownloadEvents = Effect.fn("OperationsService.exportDownloadEvents")(function* (
    queryInput: {
      animeId?: number;
      downloadId?: number;
      endDate?: string;
      eventType?: string;
      limit?: number;
      order?: "asc" | "desc";
      startDate?: string;
      status?: string;
    } = {},
  ) {
    const limit = Math.max(1, Math.min(queryInput.limit ?? 10_000, 50_000));
    const order = queryInput.order === "asc" ? "asc" : "desc";
    const baseConditions = buildDownloadEventConditions(queryInput);

    const query = input.db
      .select()
      .from(downloadEvents)
      .orderBy(order === "asc" ? asc(downloadEvents.id) : desc(downloadEvents.id))
      .limit(limit + 1);
    const rows = yield* input.tryDatabasePromise("Failed to export download events", () =>
      baseConditions.length > 0 ? query.where(and(...baseConditions)) : query,
    );
    const totalRows = yield* input.tryDatabasePromise("Failed to count download events", () => {
      const totalQuery = input.db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
      return baseConditions.length > 0 ? totalQuery.where(and(...baseConditions)) : totalQuery;
    });

    const truncated = rows.length > limit;
    const exportRows = truncated ? rows.slice(0, limit) : rows;
    const contexts = yield* loadDownloadEventPresentationContexts(input.db, exportRows);
    const events = yield* Effect.forEach(exportRows, (row) =>
      toDownloadEvent(row, contexts.get(row.id)),
    );
    const total = Number(totalRows[0]?.count ?? 0);

    const generatedAt = yield* nowIso();
    return {
      events,
      total,
      exported: events.length,
      truncated,
      limit,
      order,
      generated_at: generatedAt,
    } satisfies DownloadEventsExport;
  });

  const listDownloadQueue = Effect.fn("OperationsService.listDownloadQueue")(function* () {
    const rows = yield* input.tryDatabasePromise("Failed to list download queue", () =>
      input.db
        .select()
        .from(downloads)
        .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
        .orderBy(desc(downloads.id)),
    );
    const contexts = yield* loadDownloadPresentationContexts(input.db, rows);
    return yield* Effect.forEach(rows, (row) => toDownload(row, contexts.get(row.id)));
  });

  const listDownloadHistory = Effect.fn("OperationsService.listDownloadHistory")(function* () {
    const rows = yield* input.tryDatabasePromise("Failed to list download history", () =>
      input.db.select().from(downloads).orderBy(desc(downloads.id)),
    );
    const contexts = yield* loadDownloadPresentationContexts(input.db, rows);
    return yield* Effect.forEach(rows, (row) => toDownload(row, contexts.get(row.id)));
  });

  const getDownloadProgress = Effect.fn("OperationsService.getDownloadProgress")(function* () {
    const rows = yield* input.tryDatabasePromise("Failed to build download progress snapshot", () =>
      input.db
        .select()
        .from(downloads)
        .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
        .orderBy(desc(downloads.id)),
    );
    const contexts = yield* loadDownloadPresentationContexts(input.db, rows);
    return yield* Effect.forEach(rows, (row) => toDownloadStatus(row, contexts.get(row.id)));
  });

  return {
    exportDownloadEvents,
    getDownloadProgress,
    listDownloadEvents,
    listDownloadHistory,
    listDownloadQueue,
  };
}

const hasAdjacentDownloadEvent = Effect.fn("OperationsService.hasAdjacentDownloadEvent")(function* (
  db: AppDatabase,
  tryDatabasePromise: TryDatabasePromise,
  baseConditions: ReadonlyArray<Parameters<typeof and>[number]>,
  cursorCondition: Parameters<typeof and>[number],
) {
  const rows = yield* tryDatabasePromise("Failed to load download events", () =>
    db
      .select({ id: downloadEvents.id })
      .from(downloadEvents)
      .where(and(...baseConditions, cursorCondition))
      .limit(1),
  );

  return rows.length > 0;
});
