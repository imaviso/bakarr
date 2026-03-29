import { Context, Effect, Layer } from "effect";

import type { SystemLogsResponse } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { systemLogs } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { appendSystemLog, normalizeLevel } from "@/features/system/support.ts";
import { loadSystemLogPage } from "@/features/system/repository/stats-repository.ts";

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

  const triggerInfoEvent = Effect.fn("SystemLogService.triggerInfoEvent")(function* (
    message: string,
    eventType: string,
  ) {
    yield* appendSystemLog(db, eventType, "info", message, nowIso);
    yield* eventPublisher.publishInfo(message);
  });

  return { getLogs, clearLogs, triggerInfoEvent } satisfies SystemLogServiceShape;
});

export const SystemLogServiceLive = Layer.effect(SystemLogService, makeSystemLogService);
