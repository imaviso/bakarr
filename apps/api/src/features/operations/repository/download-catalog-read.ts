/**
 * Internal Download aggregate SQL (catalog history/events + presentation).
 * Public access: DownloadRepository methods / re-exports only.
 */
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { Chunk, Effect, Option, Stream } from "effect";

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
import { decodeOptionalNumberList } from "@/features/system/profile-codec.ts";
import { StoredDataError } from "@/features/errors.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type DownloadRow = typeof downloads.$inferSelect;

const SQLITE_IN_LIST_CHUNK_SIZE = 900;
const CHUNK_LOAD_CONCURRENCY = 4;

export const loadDownloadEventPresentationContexts = Effect.fn(
  "DownloadRepository.loadDownloadEventPresentationContexts",
)(function* (db: AppDatabase, rows: readonly DownloadEventRowLike[]) {
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
    tryDatabasePromise("Failed to load download event presentation contexts", () =>
      db
        .select({
          coverImage: media.coverImage,
          id: media.id,
          titleEnglish: media.titleEnglish,
          titleRomaji: media.titleRomaji,
        })
        .from(media)
        .where(inArray(media.id, chunk)),
    ),
  );
  const animeById = new Map(animeRows.map((row) => [row.id, row] as const));

  const downloadRows = yield* loadRowsByChunk(downloadIds, (chunk) =>
    tryDatabasePromise("Failed to load download event presentation contexts", () =>
      db
        .select({
          id: downloads.id,
          torrentName: downloads.torrentName,
        })
        .from(downloads)
        .where(inArray(downloads.id, chunk)),
    ),
  );
  const downloadById = new Map(downloadRows.map((row) => [row.id, row] as const));

  return new Map(
    rows.map((row) => {
      const animeRow = row.mediaId !== null ? animeById.get(row.mediaId) : undefined;
      const downloadRow = row.downloadId !== null ? downloadById.get(row.downloadId) : undefined;

      return [
        row.id,
        {
          mediaImage: animeRow?.coverImage ?? undefined,
          mediaTitle: animeRow?.titleEnglish ?? animeRow?.titleRomaji,
          torrentName: downloadRow?.torrentName ?? undefined,
        },
      ] as const;
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
        return [] as TRow[];
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
)(function* (db: AppDatabase, rows: readonly DownloadRow[]) {
  if (rows.length === 0) {
    return new Map<number, DownloadPresentationContext>();
  }

  const animeIds = [...new Set(rows.map((row) => row.mediaId))];
  const importedMediaIds = [
    ...new Set(
      rows
        .filter((row) => row.status === "imported" || row.reconciledAt !== null)
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
    tryDatabasePromise("Failed to load download presentation contexts", () =>
      db
        .select({
          coverImage: media.coverImage,
          filePath: mediaUnits.filePath,
          id: media.id,
          number: mediaUnits.number,
        })
        .from(media)
        .leftJoin(mediaUnits, mediaUnitsJoinCondition)
        .where(inArray(media.id, chunk)),
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

  const contexts = yield* Effect.forEach(rows, (row) =>
    Effect.gen(function* () {
      const coveredUnits = (yield* decodeCoveredEpisodes(row.coveredUnits)) ?? [];
      const unitNumbers = coveredUnits.length > 0 ? coveredUnits : [row.unitNumber];
      const rowCanShowImportedPath = row.status === "imported" || row.reconciledAt !== null;
      const importedPath = rowCanShowImportedPath
        ? (unitNumbers
            .map((unitNumber) => importedPathByEpisode.get(`${row.mediaId}:${unitNumber}`))
            .find((value): value is string => typeof value === "string") ??
          (row.reconciledAt ? (row.contentPath ?? row.savePath ?? undefined) : undefined))
        : undefined;

      return [
        row.id,
        {
          mediaImage: animeImageById.get(row.mediaId),
          importedPath,
        },
      ] as const;
    }),
  );

  return new Map(contexts);
});

const decodeCoveredEpisodes = Effect.fn("DownloadRepository.decodeCoveredEpisodes")(function* (
  value: string | null | undefined,
) {
  if (!value) {
    return undefined;
  }

  return yield* decodeOptionalNumberList(value).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Stored covered episode metadata is corrupt",
        }),
    ),
  );
});

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
  queryInput: { readonly cursor?: string; readonly limit?: number } = {},
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

export const listDownloadEvents = Effect.fn("DownloadRepository.listDownloadEvents")(function* (
  db: AppDatabase,
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
    ? yield* hasAdjacentDownloadEvent(db, baseConditions, gt(downloadEvents.id, firstRowId))
    : false;
  const olderExists = lastRowId
    ? yield* hasAdjacentDownloadEvent(db, baseConditions, lt(downloadEvents.id, lastRowId))
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

export const loadDownloadEventExportHeader = Effect.fn(
  "DownloadRepository.loadDownloadEventExportHeader",
)(function* (db: AppDatabase, queryInput: DownloadEventExportQuery = {}, generatedAt: string) {
  const plan = buildDownloadEventExportPlan(queryInput);
  const totalRows = yield* tryDatabasePromise("Failed to count download events", () => {
    const totalQuery = db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
    return plan.baseConditions.length > 0
      ? totalQuery.where(and(...plan.baseConditions))
      : totalQuery;
  });
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
  queryInput: DownloadEventExportQuery = {},
): Stream.Stream<DownloadEvent, DatabaseError | StoredDataError> {
  const plan = buildDownloadEventExportPlan(queryInput);
  const pageSize = 500;

  return Stream.unfoldChunkEffect(
    { emitted: 0, cursor: undefined as number | undefined },
    (state) =>
      Effect.gen(function* () {
        const remaining = plan.limit - state.emitted;
        if (remaining <= 0) {
          return Option.none<readonly [Chunk.Chunk<DownloadEvent>, typeof state]>();
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

        const rows = yield* tryDatabasePromise("Failed to stream download events", () => {
          const query = db
            .select()
            .from(downloadEvents)
            .orderBy(plan.order === "asc" ? asc(downloadEvents.id) : desc(downloadEvents.id))
            .limit(Math.min(pageSize, remaining));

          return conditions.length > 0 ? query.where(and(...conditions)) : query;
        });

        if (rows.length === 0) {
          return Option.none<readonly [Chunk.Chunk<DownloadEvent>, typeof state]>();
        }

        const contexts = yield* loadDownloadEventPresentationContexts(db, rows);
        const events = yield* Effect.forEach(rows, (row) =>
          toDownloadEvent(row, contexts.get(row.id)),
        );
        const lastId = rows[rows.length - 1]?.id;

        return Option.some([
          Chunk.fromIterable(events),
          {
            emitted: state.emitted + events.length,
            cursor: lastId,
          },
        ] as const);
      }),
  );
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
  function* (db: AppDatabase, baseConditions: readonly SQL[], cursorCondition: SQL) {
    const rows = yield* tryDatabasePromise("Failed to load download events", () =>
      db
        .select({ id: downloadEvents.id })
        .from(downloadEvents)
        .where(and(...baseConditions, cursorCondition))
        .limit(1),
    );

    return rows.length > 0;
  },
);
