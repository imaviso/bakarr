import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { Chunk, Context, Effect, Layer, Option, Stream } from "effect";

import type {
  Download,
  DownloadEvent,
  DownloadHistoryPage,
  DownloadEventsPage,
  DownloadStatus,
} from "@packages/shared/index.ts";
import { Database, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { anime, downloadEvents, downloads, episodes } from "@/db/schema.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import {
  toDownload,
  toDownloadStatus,
} from "@/features/operations/repository/download-repository.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/lib/download-event-presentations.ts";
import { tryDatabasePromise, type TryDatabasePromise } from "@/lib/effect-db.ts";
import { deriveEpisodeTimelineMetadata } from "@/lib/anime-derivations.ts";
import { buildRenamePreview } from "@/features/operations/library-import.ts";
import type { CalendarEvent, MissingEpisode, RenamePreviewItem } from "@packages/shared/index.ts";
import type { OperationsError } from "@/features/operations/errors.ts";

const textEncoder = new TextEncoder();

export interface CatalogDownloadViewSupportShape {
  readonly getWantedMissing: (limit: number) => Effect.Effect<MissingEpisode[], DatabaseError>;
  readonly getCalendar: (
    start: string,
    end: string,
  ) => Effect.Effect<CalendarEvent[], DatabaseError>;
  readonly getRenamePreview: (
    animeId: number,
  ) => Effect.Effect<RenamePreviewItem[], OperationsError | DatabaseError>;
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
  readonly streamDownloadEventsExportJson: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<
    DownloadEventExportStreamShape,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly streamDownloadEventsExportCsv: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<
    DownloadEventCsvExportStreamShape,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly listDownloadQueue: () => Effect.Effect<
    Download[],
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly listDownloadHistory: (input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }) => Effect.Effect<
    DownloadHistoryPage,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly getDownloadProgress: () => Effect.Effect<
    DownloadStatus[],
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
}

export interface DownloadEventExportHeader {
  readonly exported: number;
  readonly generated_at: string;
  readonly limit: number;
  readonly order: "asc" | "desc";
  readonly total: number;
  readonly truncated: boolean;
}

export interface DownloadEventExportQuery {
  readonly animeId?: number;
  readonly downloadId?: number;
  readonly endDate?: string;
  readonly eventType?: string;
  readonly limit?: number;
  readonly order?: "asc" | "desc";
  readonly startDate?: string;
  readonly status?: string;
}

export interface DownloadEventExportStreamShape {
  readonly header: DownloadEventExportHeader;
  readonly stream: Stream.Stream<
    Uint8Array,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
}

export interface DownloadEventCsvExportStreamShape {
  readonly header: DownloadEventExportHeader;
  readonly stream: Stream.Stream<
    Uint8Array,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
}

export type CatalogLibraryReadServiceShape = Pick<
  CatalogDownloadViewSupportShape,
  "getCalendar" | "getRenamePreview" | "getWantedMissing"
>;

export class CatalogLibraryReadService extends Context.Tag("@bakarr/api/CatalogLibraryReadService")<
  CatalogLibraryReadService,
  CatalogLibraryReadServiceShape
>() {}

type DownloadEventQueryInput = {
  animeId?: number;
  downloadId?: number;
  endDate?: string;
  eventType?: string;
  startDate?: string;
  status?: string;
};

interface DownloadEventExportPlan {
  readonly baseConditions: readonly SQL<unknown>[];
  readonly limit: number;
  readonly order: "asc" | "desc";
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

function buildDownloadEventExportPlan(
  queryInput: DownloadEventExportQuery = {},
): DownloadEventExportPlan {
  return {
    baseConditions: buildDownloadEventConditions(queryInput),
    limit: Math.max(1, Math.min(queryInput.limit ?? 10_000, 50_000)),
    order: queryInput.order === "asc" ? "asc" : "desc",
  };
}

export function makeCatalogDownloadViewSupport(input: {
  db: AppDatabase;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}): CatalogDownloadViewSupportShape {
  const { nowIso } = input;
  const getWantedMissing = Effect.fn("OperationsService.getWantedMissing")(function* (
    limit: number,
  ) {
    const now = new Date(yield* nowIso()).toISOString();
    const rows = yield* input.tryDatabasePromise("Failed to load wanted episodes", () =>
      input.db
        .select({
          animeId: anime.id,
          animeTitle: anime.titleRomaji,
          coverImage: anime.coverImage,
          nextAiringAt: anime.nextAiringAt,
          nextAiringEpisode: anime.nextAiringEpisode,
          episodeNumber: episodes.number,
          title: episodes.title,
          aired: episodes.aired,
        })
        .from(episodes)
        .innerJoin(anime, eq(anime.id, episodes.animeId))
        .where(
          and(
            eq(anime.monitored, true),
            eq(episodes.downloaded, false),
            sql`${episodes.aired} is not null`,
            sql`${episodes.aired} <= ${now}`,
          ),
        )
        .orderBy(episodes.aired, anime.titleRomaji)
        .limit(Math.max(1, limit)),
    );

    return rows.map((row) => {
      const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined, new Date(now));

      return {
        aired: row.aired ?? undefined,
        airing_status: timeline.airing_status,
        anime_id: row.animeId,
        anime_image: row.coverImage ?? undefined,
        anime_title: row.animeTitle,
        episode_number: row.episodeNumber,
        episode_title: row.title ?? undefined,
        is_future: timeline.is_future,
        next_airing_episode:
          row.nextAiringAt && row.nextAiringEpisode
            ? {
                airing_at: row.nextAiringAt,
                episode: row.nextAiringEpisode,
              }
            : undefined,
      } satisfies MissingEpisode;
    });
  });

  const getCalendar = Effect.fn("OperationsService.getCalendar")(function* (
    start: string,
    end: string,
  ) {
    const now = new Date(yield* nowIso());
    const nowIsoValue = now.toISOString();
    const rows = yield* input.tryDatabasePromise("Failed to load calendar events", () =>
      input.db
        .select()
        .from(episodes)
        .innerJoin(anime, eq(anime.id, episodes.animeId))
        .where(and(sql`${episodes.aired} >= ${start}`, sql`${episodes.aired} <= ${end}`))
        .orderBy(episodes.aired, anime.titleRomaji),
    );

    return rows.map(({ anime: animeRow, episodes: episodeRow }) => {
      const timeline = deriveEpisodeTimelineMetadata(episodeRow.aired ?? undefined, now);

      return {
        all_day: isAllDayAiring(episodeRow.aired),
        end: episodeRow.aired ?? nowIsoValue,
        extended_props: {
          airing_status: timeline.airing_status,
          anime_id: animeRow.id,
          anime_image: animeRow.coverImage ?? undefined,
          anime_title: animeRow.titleRomaji,
          downloaded: episodeRow.downloaded,
          episode_number: episodeRow.number,
          episode_title: episodeRow.title ?? undefined,
          is_future: timeline.is_future,
        },
        id: `${animeRow.id}-${episodeRow.number}`,
        start: episodeRow.aired ?? nowIsoValue,
        title: buildCalendarEventTitle(animeRow.titleRomaji, episodeRow),
      } satisfies CalendarEvent;
    });
  });

  const getRenamePreview = Effect.fn("OperationsService.getRenamePreview")(function* (
    animeId: number,
  ) {
    return yield* buildRenamePreview(input.db, animeId);
  });

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

  const streamDownloadEventsExportJson = Effect.fn(
    "OperationsService.streamDownloadEventsExportJson",
  )(function* (queryInput: DownloadEventExportQuery = {}) {
    const plan = buildDownloadEventExportPlan(queryInput);
    const metadata = yield* loadDownloadEventExportMetadata(
      input.db,
      input.tryDatabasePromise,
      plan,
      nowIso,
    );
    const suffixMetadata = JSON.stringify({
      exported: metadata.exported,
      generated_at: metadata.generated_at,
      limit: metadata.limit,
      order: metadata.order,
      total: metadata.total,
      truncated: metadata.truncated,
    });
    const objectPrefix = textEncoder.encode('{"events":[');
    const objectSuffix = textEncoder.encode(`],${suffixMetadata.slice(1)}`);

    const eventStream = streamDownloadEvents(input.db, input.tryDatabasePromise, plan).pipe(
      Stream.zipWithIndex,
      Stream.map(([event, index]) =>
        textEncoder.encode(`${index === 0 ? "" : ","}${JSON.stringify(event)}`),
      ),
    );

    const stream = Stream.concat(
      Stream.fromIterable([objectPrefix]),
      Stream.concat(eventStream, Stream.fromIterable([objectSuffix])),
    );

    return {
      header: {
        exported: metadata.exported,
        generated_at: metadata.generated_at,
        limit: metadata.limit,
        order: metadata.order,
        total: metadata.total,
        truncated: metadata.truncated,
      },
      stream,
    } satisfies DownloadEventExportStreamShape;
  });

  const streamDownloadEventsExportCsv = Effect.fn(
    "OperationsService.streamDownloadEventsExportCsv",
  )(function* (queryInput: DownloadEventExportQuery = {}) {
    const plan = buildDownloadEventExportPlan(queryInput);
    const metadata = yield* loadDownloadEventExportMetadata(
      input.db,
      input.tryDatabasePromise,
      plan,
      nowIso,
    );
    const csvHeader = textEncoder.encode(
      "id,created_at,event_type,from_status,to_status,anime_id,anime_title,download_id,torrent_name,message,metadata,metadata_json\n",
    );
    const csvRows = streamDownloadEvents(input.db, input.tryDatabasePromise, plan).pipe(
      Stream.map((event) =>
        textEncoder.encode(
          [
            String(event.id),
            event.created_at,
            escapeCsv(event.event_type),
            escapeCsv(event.from_status ?? ""),
            escapeCsv(event.to_status ?? ""),
            event.anime_id === undefined ? "" : String(event.anime_id),
            escapeCsv(event.anime_title ?? ""),
            event.download_id === undefined ? "" : String(event.download_id),
            escapeCsv(event.torrent_name ?? ""),
            escapeCsv(event.message),
            escapeCsv(event.metadata ?? ""),
            escapeCsv(event.metadata_json ? JSON.stringify(event.metadata_json) : ""),
          ].join(",") + "\n",
        ),
      ),
    );

    return {
      header: {
        exported: metadata.exported,
        generated_at: metadata.generated_at,
        limit: metadata.limit,
        order: metadata.order,
        total: metadata.total,
        truncated: metadata.truncated,
      },
      stream: Stream.concat(Stream.fromIterable([csvHeader]), csvRows),
    } satisfies DownloadEventCsvExportStreamShape;
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

  const listDownloadHistory = Effect.fn("OperationsService.listDownloadHistory")(function* (
    queryInput: { cursor?: string; limit?: number } = {},
  ) {
    const limit = Math.max(1, Math.min(queryInput.limit ?? 200, 1000));
    const cursorId =
      queryInput.cursor && /^\d+$/.test(queryInput.cursor) ? Number(queryInput.cursor) : undefined;
    const query = input.db
      .select()
      .from(downloads)
      .orderBy(desc(downloads.id))
      .limit(limit + 1);
    const rows = yield* input.tryDatabasePromise("Failed to list download history", () =>
      cursorId ? query.where(lt(downloads.id, cursorId)) : query,
    );
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const contexts = yield* loadDownloadPresentationContexts(input.db, pageRows);
    const mappedRows = yield* Effect.forEach(pageRows, (row) =>
      toDownload(row, contexts.get(row.id)),
    );
    const countRows = yield* input.tryDatabasePromise("Failed to count download history", () =>
      input.db.select({ count: sql<number>`count(*)` }).from(downloads),
    );
    const total = Number(countRows[0]?.count ?? 0);
    const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.id : undefined;

    return {
      downloads: mappedRows,
      has_more: hasMore,
      limit,
      next_cursor: nextCursor ? String(nextCursor) : undefined,
      total,
    } satisfies DownloadHistoryPage;
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
    getCalendar,
    getDownloadProgress,
    listDownloadEvents,
    listDownloadHistory,
    listDownloadQueue,
    getRenamePreview,
    getWantedMissing,
    streamDownloadEventsExportCsv,
    streamDownloadEventsExportJson,
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

const loadDownloadEventExportMetadata = Effect.fn(
  "OperationsService.loadDownloadEventExportMetadata",
)(function* (
  db: AppDatabase,
  tryDatabasePromise: TryDatabasePromise,
  plan: DownloadEventExportPlan,
  nowIso: () => Effect.Effect<string>,
) {
  const totalRows = yield* tryDatabasePromise("Failed to count download events", () => {
    const totalQuery = db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
    return plan.baseConditions.length > 0
      ? totalQuery.where(and(...plan.baseConditions))
      : totalQuery;
  });
  const total = Number(totalRows[0]?.count ?? 0);
  const generated_at = yield* nowIso();

  return {
    exported: Math.min(total, plan.limit),
    generated_at,
    limit: plan.limit,
    order: plan.order,
    total,
    truncated: total > plan.limit,
  } satisfies DownloadEventExportHeader;
});

function streamDownloadEvents(
  db: AppDatabase,
  tryDatabasePromise: TryDatabasePromise,
  plan: DownloadEventExportPlan,
): Stream.Stream<DownloadEvent, DatabaseError | import("./errors.ts").OperationsStoredDataError> {
  const pageSize = 500;

  return Stream.unfoldChunkEffect(
    { emitted: 0, cursor: undefined as number | undefined },
    (state) =>
      Effect.gen(function* () {
        const remaining = plan.limit - state.emitted;
        if (remaining <= 0) {
          return Option.none<readonly [Chunk.Chunk<DownloadEvent>, typeof state]>();
        }

        let cursorCondition: SQL<unknown> | undefined;

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

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export type CatalogDownloadReadServiceShape = Pick<
  CatalogDownloadViewSupportShape,
  | "getDownloadProgress"
  | "listDownloadEvents"
  | "listDownloadHistory"
  | "listDownloadQueue"
  | "streamDownloadEventsExportCsv"
  | "streamDownloadEventsExportJson"
>;

export class CatalogDownloadReadService extends Context.Tag(
  "@bakarr/api/CatalogDownloadReadService",
)<CatalogDownloadReadService, CatalogDownloadReadServiceShape>() {}

export const CatalogDownloadReadServiceLive = Layer.effect(
  CatalogDownloadReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;
    const support = makeCatalogDownloadViewSupport({
      db,
      nowIso: () => nowIsoFromClock(clock),
      tryDatabasePromise,
    });

    return CatalogDownloadReadService.of({
      getDownloadProgress: support.getDownloadProgress,
      listDownloadEvents: support.listDownloadEvents,
      listDownloadHistory: support.listDownloadHistory,
      listDownloadQueue: support.listDownloadQueue,
      streamDownloadEventsExportCsv: support.streamDownloadEventsExportCsv,
      streamDownloadEventsExportJson: support.streamDownloadEventsExportJson,
    });
  }),
);

export const CatalogLibraryReadServiceLive = Layer.effect(
  CatalogLibraryReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;
    const support = makeCatalogDownloadViewSupport({
      db,
      nowIso: () => nowIsoFromClock(clock),
      tryDatabasePromise,
    });

    return CatalogLibraryReadService.of({
      getCalendar: support.getCalendar,
      getRenamePreview: support.getRenamePreview,
      getWantedMissing: support.getWantedMissing,
    });
  }),
);

function isAllDayAiring(aired?: string | null) {
  return !aired?.includes("T");
}

function buildCalendarEventTitle(
  animeTitle: string,
  episodeRow: { number: number; title: string | null },
) {
  return episodeRow.title
    ? `${animeTitle} - Episode ${episodeRow.number}: ${episodeRow.title}`
    : `${animeTitle} - Episode ${episodeRow.number}`;
}
