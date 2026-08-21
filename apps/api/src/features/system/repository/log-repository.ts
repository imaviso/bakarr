import { and, count, desc, lt, sql } from "drizzle-orm";
import { Chunk, Effect, Option, Stream } from "effect";

import type { SystemLog } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  buildSystemLogConditions,
  encodeLogExportCsvStream,
  encodeLogExportJsonStream,
  toSystemLog,
  type SystemLogExportHeader,
  type SystemLogExportPlan,
} from "@/features/system/system-log-export.ts";

const EXPORT_PAGE_SIZE = 500;

type NowIso<E = never> = () => Effect.Effect<string, E>;
type SystemLogPageInput = {
  endDate?: string;
  eventType?: string;
  level?: string;
  page: number;
  pageSize: number;
  startDate?: string;
};

export interface SystemLogRepositoryShape {
  readonly appendLog: <E>(
    eventType: string,
    level: string,
    message: string,
    nowIso: NowIso<E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly clearLogs: () => Effect.Effect<void, DatabaseError>;
  /** Retention sweep: deletes rows created before `cutoffIso`; returns deleted count. */
  readonly deleteLogsOlderThan: (cutoffIso: string) => Effect.Effect<number, DatabaseError>;
  readonly loadExportHeader: (
    plan: SystemLogExportPlan,
    nowIso: NowIso,
  ) => Effect.Effect<SystemLogExportHeader, DatabaseError>;
  readonly loadPage: (
    input: SystemLogPageInput,
  ) => Effect.Effect<{ rows: (typeof systemLogs.$inferSelect)[]; total: number }, DatabaseError>;
  readonly streamExportCsv: (plan: SystemLogExportPlan) => Stream.Stream<Uint8Array, DatabaseError>;
  readonly streamExportJson: (
    plan: SystemLogExportPlan,
  ) => Stream.Stream<Uint8Array, DatabaseError>;
}

export class SystemLogRepository extends Effect.Service<SystemLogRepository>()(
  "@bakarr/api/SystemLogRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeSystemLogRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export function makeSystemLogRepositoryShape(db: AppDatabase): SystemLogRepositoryShape {
  return {
    appendLog: (eventType, level, message, nowIso) =>
      appendSystemLog(db, eventType, level, message, nowIso),
    clearLogs: () => clearSystemLogRows(db),
    deleteLogsOlderThan: (cutoffIso) => deleteSystemLogsOlderThan(db, cutoffIso),
    loadExportHeader: (plan, nowIso) => loadSystemLogExportHeader(db, plan, nowIso),
    loadPage: (input) => loadSystemLogPage(db, input),
    streamExportCsv: (plan) => encodeLogExportCsvStream(streamSystemLogs(db, plan)),
    streamExportJson: (plan) => encodeLogExportJsonStream(streamSystemLogs(db, plan)),
  } satisfies SystemLogRepositoryShape;
}

const appendSystemLog = Effect.fn("SystemLogRepository.appendLog")(function* <E>(
  db: AppDatabase,
  eventType: string,
  level: string,
  message: string,
  nowIso: NowIso<E>,
) {
  const now = yield* nowIso();
  yield* tryDatabasePromise("Failed to append system log", () =>
    db.insert(systemLogs).values({
      createdAt: now,
      details: null,
      eventType,
      level,
      message,
    }),
  );
});

const clearSystemLogRows = Effect.fn("SystemLogRepository.clearLogs")(function* (db: AppDatabase) {
  yield* tryDatabasePromise("Failed to clear system logs", () => db.delete(systemLogs));
});

const deleteSystemLogsOlderThan = Effect.fn("SystemLogRepository.deleteLogsOlderThan")(function* (
  db: AppDatabase,
  cutoffIso: string,
) {
  return yield* tryDatabasePromise("Failed to prune old system logs", () =>
    db
      .delete(systemLogs)
      .where(lt(systemLogs.createdAt, cutoffIso))
      .returning({ id: systemLogs.id }),
  ).pipe(Effect.map((rows) => rows.length));
});

export const loadSystemLogPage = Effect.fn("SystemLogRepository.loadPage")(function* (
  db: AppDatabase,
  input: SystemLogPageInput,
) {
  const conditions = buildSystemLogConditions(input);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const countQuery = db.select({ value: count() }).from(systemLogs);
  const rowsQuery = db
    .select()
    .from(systemLogs)
    .orderBy(desc(systemLogs.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  const totalRows = yield* tryDatabasePromise("Failed to load system logs", () =>
    whereClause ? countQuery.where(whereClause) : countQuery,
  );
  const total = totalRows[0]?.value ?? 0;
  const rows = yield* tryDatabasePromise("Failed to load system logs", () =>
    whereClause ? rowsQuery.where(whereClause) : rowsQuery,
  );

  return { rows, total };
});

const loadSystemLogExportHeader = Effect.fn("SystemLogRepository.loadExportHeader")(function* (
  db: AppDatabase,
  plan: SystemLogExportPlan,
  nowIso: NowIso,
) {
  const countQuery = db.select({ value: sql<number>`count(*)` }).from(systemLogs);
  const countRows = yield* tryDatabasePromise("Failed to load system logs", () =>
    plan.conditions.length > 0 ? countQuery.where(and(...plan.conditions)) : countQuery,
  );
  const total = countRows[0]?.value ?? 0;

  return {
    exported: Math.min(total, plan.limit),
    generated_at: yield* nowIso(),
    limit: plan.limit,
    total,
    truncated: total > plan.limit,
  } satisfies SystemLogExportHeader;
});

function streamSystemLogs(
  db: AppDatabase,
  plan: SystemLogExportPlan,
): Stream.Stream<SystemLog, DatabaseError> {
  const initialCursor: {
    emitted: number;
    cursor: number | undefined;
  } = { emitted: 0, cursor: undefined };

  return Stream.unfoldChunkEffect(initialCursor, (state) =>
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

      return Option.some<readonly [Chunk.Chunk<SystemLog>, typeof state]>([
        Chunk.fromIterable(rows.map(toSystemLog)),
        {
          emitted: state.emitted + rows.length,
          cursor: rows[rows.length - 1]?.id,
        },
      ]);
    }),
  );
}
