import { Context, Effect, Layer } from "effect";

import type { SystemLogsResponse } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { systemLogs } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { loadSystemLogPage } from "@/features/system/repository/stats-repository.ts";
import {
  buildSystemLogExportPlan,
  loadSystemLogExportHeader,
  streamLogExportCsv as renderSystemLogExportCsv,
  streamLogExportJson as renderSystemLogExportJson,
  type SystemLogExportStreamShape,
  toSystemLog,
} from "@/features/system/system-log-export.ts";

const PAGE_SIZE = 50;

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
  const eventBus = yield* EventBus;
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
      ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
      ...(input.eventType === undefined ? {} : { eventType: input.eventType }),
      ...(input.level === undefined ? {} : { level: input.level }),
      page: safePage,
      pageSize: safePageSize,
      ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
    });

    return {
      logs: rows.map(toSystemLog),
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

    return {
      header,
      stream: renderSystemLogExportJson(db, plan),
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

    return {
      header,
      stream: renderSystemLogExportCsv(db, plan),
    } satisfies SystemLogExportStreamShape;
  });

  const triggerInfoEvent = Effect.fn("SystemLogService.triggerInfoEvent")(function* (
    message: string,
    eventType: string,
  ) {
    yield* appendSystemLog(db, eventType, "info", message, nowIso);
    yield* eventBus.publishInfo(message);
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
