import { Context, Effect, Layer } from "effect";

import { Database, type AppDatabase } from "@/db/database.ts";
import { systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import {
  loadSystemLogExportHeader,
  streamLogExportCsv,
  streamLogExportJson,
  type SystemLogExportPlan,
} from "@/features/system/system-log-export.ts";
import { loadSystemLogPage } from "@/features/system/repository/stats-repository.ts";

type NowIso<E = never> = () => Effect.Effect<string, E>;

export interface SystemLogRepositoryShape {
  readonly appendLog: <E>(
    eventType: string,
    level: string,
    message: string,
    nowIso: NowIso<E>,
  ) => ReturnType<typeof appendSystemLog<E>>;
  readonly clearLogs: () => ReturnType<typeof clearSystemLogRows>;
  readonly loadExportHeader: (
    plan: SystemLogExportPlan,
    nowIso: NowIso,
  ) => ReturnType<typeof loadSystemLogExportHeader>;
  readonly loadPage: (input: {
    endDate?: string;
    eventType?: string;
    level?: string;
    page: number;
    pageSize: number;
    startDate?: string;
  }) => ReturnType<typeof loadSystemLogPage>;
  readonly streamExportCsv: (plan: SystemLogExportPlan) => ReturnType<typeof streamLogExportCsv>;
  readonly streamExportJson: (plan: SystemLogExportPlan) => ReturnType<typeof streamLogExportJson>;
}

export class SystemLogRepository extends Context.Tag("@bakarr/api/SystemLogRepository")<
  SystemLogRepository,
  SystemLogRepositoryShape
>() {}

export const clearSystemLogRows = Effect.fn("SystemLogRepository.clearSystemLogRows")(function* (
  db: AppDatabase,
) {
  yield* tryDatabasePromise("Failed to clear system logs", () => db.delete(systemLogs));
});

export function makeSystemLogRepository(db: AppDatabase): SystemLogRepositoryShape {
  return SystemLogRepository.of({
    appendLog: (eventType, level, message, nowIso) =>
      appendSystemLog(db, eventType, level, message, nowIso),
    clearLogs: () => clearSystemLogRows(db),
    loadExportHeader: (plan, nowIso) => loadSystemLogExportHeader(db, plan, nowIso),
    loadPage: (input) => loadSystemLogPage(db, input),
    streamExportCsv: (plan) => streamLogExportCsv(db, plan),
    streamExportJson: (plan) => streamLogExportJson(db, plan),
  });
}

export const SystemLogRepositoryLive = Layer.effect(
  SystemLogRepository,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return makeSystemLogRepository(db);
  }),
);
