import { and, desc, lt, sql, type SQL } from "drizzle-orm";
import { Chunk, Effect, Option, Stream } from "effect";

import type { SystemLog } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { eventTypeCondition, normalizeLevel } from "@/features/system/support.ts";

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

interface SystemLogExportPlan {
  readonly conditions: readonly SQL[];
  readonly limit: number;
}

export function buildSystemLogExportPlan(input: {
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

export function buildSystemLogConditions(input: {
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

export function toSystemLog(row: typeof systemLogs.$inferSelect): SystemLog {
  return {
    created_at: row.createdAt,
    details: row.details ?? undefined,
    event_type: row.eventType,
    id: row.id,
    level: normalizeLevel(row.level),
    message: row.message,
  } satisfies SystemLog;
}

export const loadSystemLogExportHeader = Effect.fn("SystemLogExport.loadHeader")(function* (
  db: typeof Database.Service.db,
  plan: SystemLogExportPlan,
  nowIso: () => Effect.Effect<string>,
) {
  const countQuery = db.select({ value: sql<number>`count(*)` }).from(systemLogs);
  const countRows = yield* tryDatabasePromise("Failed to load system logs", () =>
    plan.conditions.length > 0 ? countQuery.where(and(...plan.conditions)) : countQuery,
  );
  const value = countRows[0]?.value;
  const total = value ?? 0;

  return {
    exported: Math.min(total, plan.limit),
    generated_at: yield* nowIso(),
    limit: plan.limit,
    total,
    truncated: total > plan.limit,
  } satisfies SystemLogExportHeader;
});

export function streamLogExportJson(
  db: typeof Database.Service.db,
  plan: SystemLogExportPlan,
): Stream.Stream<Uint8Array, DatabaseError> {
  const prefix = textEncoder.encode("[");
  const suffix = textEncoder.encode("]");
  const rowStream = streamSystemLogs(db, plan).pipe(
    Stream.zipWithIndex,
    Stream.map(([log, index]) =>
      textEncoder.encode(`${index === 0 ? "" : ","}${JSON.stringify(log)}`),
    ),
  );

  return Stream.concat(
    Stream.fromIterable([prefix]),
    Stream.concat(rowStream, Stream.fromIterable([suffix])),
  );
}

export function streamLogExportCsv(
  db: typeof Database.Service.db,
  plan: SystemLogExportPlan,
): Stream.Stream<Uint8Array, DatabaseError> {
  const csvHeader = textEncoder.encode("id,level,event_type,message,created_at\n");
  const rowStream = streamSystemLogs(db, plan).pipe(
    Stream.map((log) =>
      textEncoder.encode(
        `${log.id},${log.level},${escapeCsv(log.event_type)},${escapeCsv(log.message)},${log.created_at}\n`,
      ),
    ),
  );

  return Stream.concat(Stream.fromIterable([csvHeader]), rowStream);
}

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
          Chunk.fromIterable(rows.map(toSystemLog)),
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
