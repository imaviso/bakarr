import { and, desc, lt, sql, type SQL } from "drizzle-orm";
import { Chunk, Context, Effect, Layer, Option, Stream } from "effect";

import type { SystemLog, SystemLogsResponse } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { systemLogs } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { appendSystemLog, eventTypeCondition, normalizeLevel } from "@/features/system/support.ts";
import { loadSystemLogPage } from "@/features/system/repository/stats-repository.ts";

const PAGE_SIZE = 50;
const EXPORT_LIMIT = 10_000;
const EXPORT_PAGE_SIZE = 500;
const textEncoder = new TextEncoder();

export interface SystemLogExportHeader {
  readonly exported: number;
  readonly generated_at: string;
  readonly limit: number;
  readonly total: number;
  readonly truncated: boolean;
}

export interface SystemLogExportStreamShape {
  readonly header: SystemLogExportHeader;
  readonly stream: Stream.Stream<Uint8Array, DatabaseError>;
}

export interface SystemLogServiceShape {
  readonly getLogs: (input: {
    page: number;
    pageSize?: number;
    level?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
  }) => Effect.Effect<SystemLogsResponse, DatabaseError>;
  readonly clearLogs: () => Effect.Effect<void, DatabaseError>;
  readonly streamLogExportCsv: (input: {
    endDate?: string;
    eventType?: string;
    level?: string;
    startDate?: string;
  }) => Effect.Effect<SystemLogExportStreamShape, DatabaseError>;
  readonly streamLogExportJson: (input: {
    endDate?: string;
    eventType?: string;
    level?: string;
    startDate?: string;
  }) => Effect.Effect<SystemLogExportStreamShape, DatabaseError>;
  readonly triggerInfoEvent: (
    message: string,
    eventType: string,
  ) => Effect.Effect<void, DatabaseError>;
}

export class SystemLogService extends Context.Tag("@bakarr/api/SystemLogService")<
  SystemLogService,
  SystemLogServiceShape
>() {}

const makeSystemLogService = Effect.gen(function* () {
  const { db } = yield* Database;
  const clock = yield* ClockService;
  const eventPublisher = yield* EventPublisher;
  const nowIso = () => nowIsoFromClock(clock);

  const getLogs = Effect.fn("SystemLogService.getLogs")(function* (input: {
    level?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    pageSize?: number;
  }) {
    const safePage = Math.max(1, input.page);
    const safePageSize = Math.max(1, Math.min(input.pageSize ?? PAGE_SIZE, 10_000));
    const { rows, total } = yield* loadSystemLogPage(db, {
      endDate: input.endDate,
      eventType: input.eventType,
      level: input.level,
      page: safePage,
      pageSize: safePageSize,
      startDate: input.startDate,
    });

    return {
      logs: rows.map((row) => ({
        created_at: row.createdAt,
        details: row.details ?? undefined,
        event_type: row.eventType,
        id: row.id,
        level: normalizeLevel(row.level),
        message: row.message,
      })),
      total_pages: Math.max(1, Math.ceil(total / safePageSize)),
    } satisfies SystemLogsResponse;
  });

  const clearLogs = Effect.fn("SystemLogService.clearLogs")(function* () {
    yield* tryDatabasePromise("Failed to clear system logs", () => db.delete(systemLogs));
  });

  const streamLogExportJson = Effect.fn("SystemLogService.streamLogExportJson")(function* (input: {
    endDate?: string;
    eventType?: string;
    level?: string;
    startDate?: string;
  }) {
    const plan = buildSystemLogExportPlan(input);
    const header = yield* loadSystemLogExportHeader(db, plan, nowIso);
    const prefix = textEncoder.encode("[");
    const suffix = textEncoder.encode("]");
    const rowStream = streamSystemLogs(db, plan).pipe(
      Stream.zipWithIndex,
      Stream.map(([log, index]) =>
        textEncoder.encode(`${index === 0 ? "" : ","}${JSON.stringify(log)}`),
      ),
    );

    return {
      header,
      stream: Stream.concat(
        Stream.fromIterable([prefix]),
        Stream.concat(rowStream, Stream.fromIterable([suffix])),
      ),
    } satisfies SystemLogExportStreamShape;
  });

  const streamLogExportCsv = Effect.fn("SystemLogService.streamLogExportCsv")(function* (input: {
    endDate?: string;
    eventType?: string;
    level?: string;
    startDate?: string;
  }) {
    const plan = buildSystemLogExportPlan(input);
    const header = yield* loadSystemLogExportHeader(db, plan, nowIso);
    const csvHeader = textEncoder.encode("id,level,event_type,message,created_at\n");
    const rowStream = streamSystemLogs(db, plan).pipe(
      Stream.map((log) =>
        textEncoder.encode(
          `${log.id},${log.level},${escapeCsv(log.event_type)},${escapeCsv(log.message)},${log.created_at}\n`,
        ),
      ),
    );

    return {
      header,
      stream: Stream.concat(Stream.fromIterable([csvHeader]), rowStream),
    } satisfies SystemLogExportStreamShape;
  });

  const triggerInfoEvent = Effect.fn("SystemLogService.triggerInfoEvent")(function* (
    message: string,
    eventType: string,
  ) {
    yield* appendSystemLog(db, eventType, "info", message, nowIso);
    yield* eventPublisher.publishInfo(message);
  });

  return {
    clearLogs,
    getLogs,
    streamLogExportCsv,
    streamLogExportJson,
    triggerInfoEvent,
  } satisfies SystemLogServiceShape;
});

export const SystemLogServiceLive = Layer.effect(SystemLogService, makeSystemLogService);

interface SystemLogExportPlan {
  readonly conditions: readonly SQL<unknown>[];
  readonly limit: number;
}

function buildSystemLogExportPlan(input: {
  endDate?: string;
  eventType?: string;
  level?: string;
  startDate?: string;
}): SystemLogExportPlan {
  return {
    conditions: buildSystemLogConditions(input),
    limit: EXPORT_LIMIT,
  };
}

function buildSystemLogConditions(input: {
  endDate?: string;
  eventType?: string;
  level?: string;
  startDate?: string;
}) {
  return [
    input.level ? sql`${systemLogs.level} = ${input.level}` : undefined,
    input.eventType ? eventTypeCondition(input.eventType) : undefined,
    input.startDate ? sql`${systemLogs.createdAt} >= ${input.startDate}` : undefined,
    input.endDate ? sql`${systemLogs.createdAt} <= ${input.endDate}` : undefined,
  ].filter((value): value is Exclude<typeof value, undefined> => value !== undefined);
}

const loadSystemLogExportHeader = Effect.fn("SystemLogService.loadSystemLogExportHeader")(
  function* (
    db: typeof Database.Service.db,
    plan: SystemLogExportPlan,
    nowIso: () => Effect.Effect<string>,
  ) {
    const countQuery = db.select({ value: sql<number>`count(*)` }).from(systemLogs);
    const [{ value }] = yield* tryDatabasePromise("Failed to load system logs", () =>
      plan.conditions.length > 0 ? countQuery.where(and(...plan.conditions)) : countQuery,
    );
    const total = Number(value ?? 0);

    return {
      exported: Math.min(total, plan.limit),
      generated_at: yield* nowIso(),
      limit: plan.limit,
      total,
      truncated: total > plan.limit,
    } satisfies SystemLogExportHeader;
  },
);

function streamSystemLogs(
  db: typeof Database.Service.db,
  plan: SystemLogExportPlan,
): Stream.Stream<SystemLog, DatabaseError> {
  return Stream.unfoldChunkEffect(
    { emitted: 0, cursor: undefined as number | undefined },
    (state) =>
      Effect.gen(function* () {
        const remaining = plan.limit - state.emitted;
        if (remaining <= 0) {
          return Option.none<readonly [Chunk.Chunk<SystemLog>, typeof state]>();
        }

        const cursorCondition =
          state.cursor === undefined ? undefined : lt(systemLogs.id, state.cursor);
        const conditions = cursorCondition
          ? [...plan.conditions, cursorCondition]
          : [...plan.conditions];
        const query = db
          .select()
          .from(systemLogs)
          .orderBy(desc(systemLogs.id))
          .limit(Math.min(EXPORT_PAGE_SIZE, remaining));
        const rows = yield* tryDatabasePromise("Failed to load system logs", () =>
          conditions.length > 0 ? query.where(and(...conditions)) : query,
        );

        if (rows.length === 0) {
          return Option.none<readonly [Chunk.Chunk<SystemLog>, typeof state]>();
        }

        return Option.some([
          Chunk.fromIterable(
            rows.map(
              (row) =>
                ({
                  created_at: row.createdAt,
                  details: row.details ?? undefined,
                  event_type: row.eventType,
                  id: row.id,
                  level: normalizeLevel(row.level),
                  message: row.message,
                }) satisfies SystemLog,
            ),
          ),
          {
            emitted: state.emitted + rows.length,
            cursor: rows[rows.length - 1]?.id,
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
