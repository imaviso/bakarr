/**
 * Internal Download aggregate SQL (catalog history/events + presentation).
 * Public access: DownloadRepository methods / re-exports only.
 */

import { Chunk, Effect, Stream } from "effect";
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";

import type {
  DownloadEvent,
  DownloadEventsPage,
  DownloadHistoryPage,
} from "@packages/shared/index.ts";
import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { downloadEvents, downloads, media, mediaUnits } from "@/db/schema.ts";
import { toDownload } from "@/features/operations/download/download-presentation.ts";
import {
  toDownloadEvent,
  type DownloadEventPresentationContext,
  type DownloadEventRowLike,
} from "@/features/operations/download/download-event-presentations.ts";
import { parseCoveredUnitsEffect } from "@/features/operations/download/download-coverage.ts";
import { isClaimToken } from "@/features/operations/download/download-claim-token.ts";
import { StoredDataError } from "@/features/errors.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import type { DbExecutor } from "@/infra/effect/db.ts";

type DownloadRow = typeof downloads.$inferSelect;

const SQLITE_IN_LIST_CHUNK_SIZE = 900;
const CHUNK_LOAD_CONCURRENCY = 4;

export interface DownloadStatusStats {
  readonly queuedDownloads: number;
  readonly activeDownloads: number;
  readonly failedDownloads: number;
  readonly importedDownloads: number;
}

export const loadDownloadStatusStats = Effect.fn("DownloadRepository.loadDownloadStatusStats")(
  function* (db: AppDatabase, exec: DbExecutor) {
    const row = yield* exec.runQuery(
      "Failed to load download status stats",
      db.effectGet<DownloadStatusStats>(sql`
        select
          coalesce(sum(case when ${downloads.status} = 'queued' then 1 else 0 end), 0) as queuedDownloads,
          coalesce(sum(case when ${downloads.status} in ('downloading', 'paused') then 1 else 0 end), 0) as activeDownloads,
          coalesce(sum(case when ${downloads.status} = 'error' then 1 else 0 end), 0) as failedDownloads,
          coalesce(sum(case when ${downloads.status} = 'imported' then 1 else 0 end), 0) as importedDownloads
        from ${downloads}
      `),
    );

    return {
      queuedDownloads: row?.queuedDownloads ?? 0,
      activeDownloads: row?.activeDownloads ?? 0,
      failedDownloads: row?.failedDownloads ?? 0,
      importedDownloads: row?.importedDownloads ?? 0,
    };
  },
);

export const listRecentDownloadEventRows = Effect.fn(
  "DownloadRepository.listRecentDownloadEventRows",
)(function* (db: AppDatabase, exec: DbExecutor, limit: number) {
  return yield* exec.runQuery(
    "Failed to list recent download events",
    db
      .select()
      .from(downloadEvents)
      .orderBy(desc(downloadEvents.id))
      .limit(limit)
      .prepare()
      .effect(),
  );
});

export const loadDownloadEventPresentationContexts = Effect.fn(
  "DownloadRepository.loadDownloadEventPresentationContexts",
)(function* (db: AppDatabase, exec: DbExecutor, rows: readonly DownloadEventRowLike[]) {
  if (rows.length === 0) {
    return new Map<number, DownloadEventPresentationContext>();
  }

  const animeIds = [
    ...new Set(rows.map((row) => row.mediaId).filter((value): value is number => value !== null)),
  ];
  const downloadIds = [
    ...new Set(
      rows.map((row) => row.downloadId).filter((value): value is number => value !== null),
    ),
  ];

  const animeRows = yield* loadRowsByChunk(animeIds, (chunk) =>
    exec.runQuery(
      "Failed to load download event presentation contexts",
      db
        .select({
          coverImage: media.coverImage,
          id: media.id,
          titleEnglish: media.titleEnglish,
          titleRomaji: media.titleRomaji,
        })
        .from(media)
        .where(inArray(media.id, chunk))
        .prepare()
        .effect(),
    ),
  );
  const animeById = new Map(
    animeRows.map((row): [number, (typeof animeRows)[number]] => [row.id, row]),
  );

  const downloadRows = yield* loadRowsByChunk(downloadIds, (chunk) =>
    exec.runQuery(
      "Failed to load download event presentation contexts",
      db
        .select({
          id: downloads.id,
          torrentName: downloads.torrentName,
        })
        .from(downloads)
        .where(inArray(downloads.id, chunk))
        .prepare()
        .effect(),
    ),
  );
  const downloadById = new Map(
    downloadRows.map((row): [number, (typeof downloadRows)[number]] => [row.id, row]),
  );

  return new Map(
    rows.map((row): [number, DownloadEventPresentationContext] => {
      const animeRow = row.mediaId !== null ? animeById.get(row.mediaId) : undefined;
      const downloadRow = row.downloadId !== null ? downloadById.get(row.downloadId) : undefined;

      return [
        row.id,
        {
          mediaImage: animeRow?.coverImage ?? undefined,
          mediaTitle: animeRow?.titleEnglish ?? animeRow?.titleRomaji,
          torrentName: downloadRow?.torrentName ?? undefined,
        },
      ];
    }),
  );
});

const loadRowsByChunk = Effect.fn("DownloadRepository.loadRowsByChunk")(
  <TId, TRow>(
    ids: readonly TId[],
    loadChunk: (chunk: readonly TId[]) => Effect.Effect<readonly TRow[], DatabaseError>,
  ): Effect.Effect<readonly TRow[], DatabaseError> =>
    Effect.gen(function* () {
      if (ids.length === 0) {
        return [];
      }

      const chunks: (readonly TId[])[] = [];
      for (let index = 0; index < ids.length; index += SQLITE_IN_LIST_CHUNK_SIZE) {
        chunks.push(ids.slice(index, index + SQLITE_IN_LIST_CHUNK_SIZE));
      }
      const chunkResults = yield* Effect.forEach(chunks, loadChunk, {
        concurrency: CHUNK_LOAD_CONCURRENCY,
      });

      return chunkResults.flatMap((chunk) => chunk);
    }),
);

/** Internal Download aggregate SQL — presentation contexts for active download rows. */
export const loadDownloadPresentationContexts = Effect.fn(
  "DownloadRepository.loadDownloadPresentationContexts",
)(function* (db: AppDatabase, exec: DbExecutor, rows: readonly DownloadRow[]) {
  if (rows.length === 0) {
    return new Map<number, DownloadPresentationContext>();
  }

  const animeIds = [...new Set(rows.map((row) => row.mediaId))];
  const importedMediaIds = [
    ...new Set(
      rows
        .filter((row) => isImportedReconciled(row.status, row.reconciledAt))
        .map((row) => row.mediaId),
    ),
  ];
  const mediaUnitsJoinCondition =
    importedMediaIds.length > 0
      ? and(
          eq(mediaUnits.mediaId, media.id),
          inArray(mediaUnits.mediaId, importedMediaIds),
          sql`${mediaUnits.filePath} is not null`,
        )
      : sql`0 = 1`;

  const presentationRows = yield* loadRowsByChunk(animeIds, (chunk) =>
    exec
      .runQuery(
        "Failed to load download presentation contexts",
        db
          .select()
          .from(media)
          .leftJoin(mediaUnits, mediaUnitsJoinCondition)
          .where(inArray(media.id, chunk))
          .prepare()
          .effect(),
      )
      .pipe(
        Effect.map((rows) =>
          rows.map(({ media: mediaRow, media_units: unitRow }) => ({
            coverImage: mediaRow.coverImage,
            filePath: unitRow?.filePath ?? null,
            id: mediaRow.id,
            number: unitRow?.number ?? null,
          })),
        ),
      ),
  );
  const animeImageById = new Map<number, string | undefined>();
  const importedPathByEpisode = new Map<string, string>();

  for (const row of presentationRows) {
    animeImageById.set(row.id, row.coverImage ?? undefined);

    if (row.filePath && row.number !== null) {
      importedPathByEpisode.set(`${row.id}:${row.number}`, row.filePath);
    }
  }

  const contexts = yield* Effect.forEach(
    rows,
    (row): Effect.Effect<[number, DownloadPresentationContext], StoredDataError> =>
      Effect.gen(function* () {
        const coveredUnits = yield* parseCoveredUnitsEffect(row.coveredUnits);
        const unitNumbers = coveredUnits.length > 0 ? coveredUnits : [row.unitNumber];
        const rowCanShowImportedPath = isImportedReconciled(row.status, row.reconciledAt);
        const importedPath = rowCanShowImportedPath
          ? (unitNumbers
              .map((unitNumber) => importedPathByEpisode.get(`${row.mediaId}:${unitNumber}`))
              .find((value): value is string => typeof value === "string") ??
            (isImportedReconciled(row.status, row.reconciledAt)
              ? (row.contentPath ?? row.savePath ?? undefined)
              : undefined))
          : undefined;

        return [
          row.id,
          {
            mediaImage: animeImageById.get(row.mediaId),
            importedPath,
          },
        ];
      }),
  );

  return new Map(contexts);
});

/**
 * A claim token in `reconciledAt` marks an in-flight (or crashed) import, not
 * a completed one: the row must not present an imported path yet.
 */
function isImportedReconciled(status: string, reconciledAt: string | null): boolean {
  return (status === "imported" || reconciledAt !== null) && !isClaimToken(reconciledAt);
}

export interface DownloadEventListQuery {
  readonly mediaId?: number;
  readonly cursor?: string;
  readonly downloadId?: number;
  readonly direction?: "next" | "prev";
  readonly endDate?: string;
  readonly eventType?: string;
  readonly limit?: number;
  readonly startDate?: string;
  readonly status?: string;
}

export interface DownloadEventExportQuery {
  readonly mediaId?: number;
  readonly downloadId?: number;
  readonly endDate?: string;
  readonly eventType?: string;
  readonly limit?: number;
  readonly order?: "asc" | "desc";
  readonly startDate?: string;
  readonly status?: string;
}

export interface DownloadEventExportHeader {
  readonly exported: number;
  readonly generated_at: string;
  readonly limit: number;
  readonly order: "asc" | "desc";
  readonly total: number;
  readonly truncated: boolean;
}

type DownloadEventFilterQuery = {
  readonly mediaId?: number;
  readonly downloadId?: number;
  readonly endDate?: string;
  readonly eventType?: string;
  readonly startDate?: string;
  readonly status?: string;
};

interface DownloadEventExportPlan {
  readonly baseConditions: readonly SQL[];
  readonly limit: number;
  readonly order: "asc" | "desc";
}

export const listDownloadHistory = Effect.fn("DownloadRepository.listDownloadHistory")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  queryInput: { readonly cursor?: string; readonly limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(queryInput.limit ?? 200, 1000));
  const cursorId =
    queryInput.cursor && /^\d+$/.test(queryInput.cursor) ? Number(queryInput.cursor) : undefined;
  const historyBase = db
    .select()
    .from(downloads)
    .orderBy(desc(downloads.id))
    .limit(limit + 1);
  if (cursorId !== undefined) {
    historyBase.where(lt(downloads.id, cursorId));
  }
  const rows = yield* exec.runQuery(
    "Failed to list download history",
    historyBase.prepare().effect(),
  );
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const contexts = yield* loadDownloadPresentationContexts(db, exec, pageRows);
  const mappedRows = yield* Effect.forEach(pageRows, (row) =>
    toDownload(row, contexts.get(row.id)),
  );
  const countRows = yield* exec.runQuery(
    "Failed to count download history",
    db
      .select({ count: sql<number>`count(*)` })
      .from(downloads)
      .prepare()
      .effect(),
  );
  const total = countRows[0]?.count ?? 0;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.id : undefined;

  return {
    downloads: mappedRows,
    has_more: hasMore,
    limit,
    next_cursor: nextCursor ? `${nextCursor}` : undefined,
    total,
  } satisfies DownloadHistoryPage;
});

export const listDownloadEvents = Effect.fn("DownloadRepository.listDownloadEvents")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  queryInput: DownloadEventListQuery = {},
) {
  const limit = Math.max(1, Math.min(queryInput.limit ?? 100, 1000));
  const cursorId =
    queryInput.cursor && /^\d+$/.test(queryInput.cursor) ? Number(queryInput.cursor) : undefined;
  const baseConditions = buildDownloadEventConditions(queryInput);
  let cursorCondition: SQL | undefined;

  if (cursorId) {
    cursorCondition =
      queryInput.direction === "prev"
        ? gt(downloadEvents.id, cursorId)
        : lt(downloadEvents.id, cursorId);
  }
  const conditions = cursorCondition ? [...baseConditions, cursorCondition] : baseConditions;
  const eventsBase = db
    .select()
    .from(downloadEvents)
    .orderBy(queryInput.direction === "prev" ? asc(downloadEvents.id) : desc(downloadEvents.id))
    .limit(limit + 1);
  if (conditions.length > 0) {
    eventsBase.where(and(...conditions));
  }
  const rows = yield* exec.runQuery(
    "Failed to load download events",
    eventsBase.prepare().effect(),
  );
  const totalBase = db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
  if (baseConditions.length > 0) {
    totalBase.where(and(...baseConditions));
  }
  const totalRows = yield* exec.runQuery(
    "Failed to count download events",
    totalBase.prepare().effect(),
  );
  const hasExtraRow = rows.length > limit;
  const pageRows = hasExtraRow ? rows.slice(0, limit) : rows;
  const orderedRows = queryInput.direction === "prev" ? [...pageRows].toReversed() : pageRows;
  const contexts = yield* loadDownloadEventPresentationContexts(db, exec, orderedRows);
  const events = yield* Effect.forEach(orderedRows, (row) =>
    toDownloadEvent(row, contexts.get(row.id)),
  );
  const total = totalRows[0]?.count ?? 0;
  const firstRowId = orderedRows[0]?.id;
  const lastRowId = orderedRows[orderedRows.length - 1]?.id;
  const newerExists = firstRowId
    ? yield* hasAdjacentDownloadEvent(db, exec, baseConditions, gt(downloadEvents.id, firstRowId))
    : false;
  const olderExists = lastRowId
    ? yield* hasAdjacentDownloadEvent(db, exec, baseConditions, lt(downloadEvents.id, lastRowId))
    : false;

  return {
    events,
    has_more: olderExists,
    limit,
    next_cursor: olderExists && lastRowId ? `${lastRowId}` : undefined,
    prev_cursor: newerExists && firstRowId ? `${firstRowId}` : undefined,
    total,
  } satisfies DownloadEventsPage;
});

export const loadDownloadEventExportHeader = Effect.fn(
  "DownloadRepository.loadDownloadEventExportHeader",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  queryInput: DownloadEventExportQuery = {},
  generatedAt: string,
) {
  const plan = buildDownloadEventExportPlan(queryInput);
  const headerTotalBase = db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
  if (plan.baseConditions.length > 0) {
    headerTotalBase.where(and(...plan.baseConditions));
  }
  const totalRows = yield* exec.runQuery(
    "Failed to count download events",
    headerTotalBase.prepare().effect(),
  );
  const total = totalRows[0]?.count ?? 0;

  return {
    exported: Math.min(total, plan.limit),
    generated_at: generatedAt,
    limit: plan.limit,
    order: plan.order,
    total,
    truncated: total > plan.limit,
  } satisfies DownloadEventExportHeader;
});

export function streamDownloadEvents(
  db: AppDatabase,
  exec: DbExecutor,
  queryInput: DownloadEventExportQuery = {},
): Stream.Stream<DownloadEvent, DatabaseError | StoredDataError> {
  const plan = buildDownloadEventExportPlan(queryInput);
  const pageSize = 500;
  interface ExportCursor {
    readonly emitted: number;
    readonly cursor: number | undefined;
  }
  const initialCursorState: ExportCursor = {
    emitted: 0,
    cursor: undefined,
  };

  return Stream.unfold<
    ExportCursor,
    Chunk.Chunk<DownloadEvent>,
    DatabaseError | StoredDataError,
    never
  >(
    initialCursorState,
    (
      state,
    ): Effect.Effect<
      readonly [Chunk.Chunk<DownloadEvent>, ExportCursor] | undefined,
      DatabaseError | StoredDataError
    > =>
      Effect.gen(function* () {
        const remaining = plan.limit - state.emitted;
        if (remaining <= 0) {
          return undefined;
        }

        let cursorCondition: SQL | undefined;

        if (state.cursor !== undefined) {
          cursorCondition =
            plan.order === "asc"
              ? gt(downloadEvents.id, state.cursor)
              : lt(downloadEvents.id, state.cursor);
        }
        const conditions = cursorCondition
          ? [...plan.baseConditions, cursorCondition]
          : [...plan.baseConditions];

        const streamBase = db
          .select()
          .from(downloadEvents)
          .orderBy(plan.order === "asc" ? asc(downloadEvents.id) : desc(downloadEvents.id))
          .limit(Math.min(pageSize, remaining));
        if (conditions.length > 0) {
          streamBase.where(and(...conditions));
        }
        const rows = yield* exec.runQuery(
          "Failed to stream download events",
          streamBase.prepare().effect(),
        );

        if (rows.length === 0) {
          return undefined;
        }

        const contexts = yield* loadDownloadEventPresentationContexts(db, exec, rows);
        const events = yield* Effect.forEach(rows, (row) =>
          toDownloadEvent(row, contexts.get(row.id)),
        );
        const lastId = rows[rows.length - 1]?.id;

        return [
          Chunk.fromIterable(events),
          {
            emitted: state.emitted + events.length,
            cursor: lastId,
          },
        ];
      }),
  ).pipe(Stream.flatMap((chunk) => Stream.fromIterable(chunk)));
}

function buildDownloadEventExportPlan(
  queryInput: DownloadEventExportQuery,
): DownloadEventExportPlan {
  return {
    baseConditions: buildDownloadEventConditions(queryInput),
    limit: Math.max(1, Math.min(queryInput.limit ?? 10_000, 50_000)),
    order: queryInput.order === "asc" ? "asc" : "desc",
  };
}

function buildDownloadEventConditions(queryInput: DownloadEventFilterQuery): SQL[] {
  return [
    queryInput.mediaId ? eq(downloadEvents.mediaId, queryInput.mediaId) : undefined,
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

const hasAdjacentDownloadEvent = Effect.fn("DownloadRepository.hasAdjacentDownloadEvent")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    baseConditions: readonly SQL[],
    cursorCondition: SQL,
  ) {
    const rows = yield* exec.runQuery(
      "Failed to load download events",
      db
        .select({ id: downloadEvents.id })
        .from(downloadEvents)
        .where(and(...baseConditions, cursorCondition))
        .limit(1)
        .prepare()
        .effect(),
    );

    return rows.length > 0;
  },
);
