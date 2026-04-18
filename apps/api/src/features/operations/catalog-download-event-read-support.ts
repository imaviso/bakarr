import { and, asc, desc, eq, gt, gte, lt, lte, or, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { DownloadEventsPage } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { downloadEvents } from "@/db/schema.ts";
import { makeCatalogDownloadEventExportSupport } from "@/features/operations/catalog-download-event-export-support.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/lib/download-event-presentations.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export type {
  DownloadEventCsvExportStreamShape,
  DownloadEventExportHeader,
  DownloadEventExportQuery,
  DownloadEventExportStreamShape,
} from "@/features/operations/catalog-download-event-export-support.ts";

type DownloadEventQueryInput = {
  animeId?: number;
  downloadId?: number;
  endDate?: string;
  eventType?: string;
  startDate?: string;
  status?: string;
};

export function makeCatalogDownloadEventReads(input: {
  readonly db: AppDatabase;
  readonly nowIso: () => Effect.Effect<string>;
  readonly tryDatabasePromise: TryDatabasePromise;
}) {
  const { db, nowIso, tryDatabasePromise } = input;

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
    const query = db
      .select()
      .from(downloadEvents)
      .orderBy(queryInput.direction === "prev" ? asc(downloadEvents.id) : desc(downloadEvents.id))
      .limit(limit + 1);
    const rows = yield* tryDatabasePromise("Failed to load download events", () =>
      conditions.length > 0 ? query.where(and(...conditions)) : query,
    );
    const totalRows = yield* tryDatabasePromise("Failed to count download events", () => {
      const totalQuery = db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
      return baseConditions.length > 0 ? totalQuery.where(and(...baseConditions)) : totalQuery;
    });
    const hasExtraRow = rows.length > limit;
    const pageRows = hasExtraRow ? rows.slice(0, limit) : rows;
    const orderedRows = queryInput.direction === "prev" ? [...pageRows].toReversed() : pageRows;
    const contexts = yield* loadDownloadEventPresentationContexts(db, orderedRows);
    const events = yield* Effect.forEach(orderedRows, (row) =>
      toDownloadEvent(row, contexts.get(row.id)),
    );
    const total = totalRows[0]?.count ?? 0;
    const firstRowId = orderedRows[0]?.id;
    const lastRowId = orderedRows[orderedRows.length - 1]?.id;
    const newerExists = firstRowId
      ? yield* hasAdjacentDownloadEvent(
          db,
          tryDatabasePromise,
          baseConditions,
          gt(downloadEvents.id, firstRowId),
        )
      : false;
    const olderExists = lastRowId
      ? yield* hasAdjacentDownloadEvent(
          db,
          tryDatabasePromise,
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
  const eventExportSupport = makeCatalogDownloadEventExportSupport({
    buildConditions: buildDownloadEventConditions,
    db,
    nowIso,
    tryDatabasePromise,
  });

  return {
    listDownloadEvents,
    streamDownloadEventsExportCsv: eventExportSupport.streamDownloadEventsExportCsv,
    streamDownloadEventsExportJson: eventExportSupport.streamDownloadEventsExportJson,
  };
}

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
