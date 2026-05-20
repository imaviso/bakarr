import { Context, Effect, Layer } from "effect";

import type { SystemLogsResponse } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import {
  buildSystemLogExportPlan,
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

const makeSystemLogService = Effect.fn("SystemLogService.make")(function* () {
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const systemLogRepository = yield* SystemLogRepository;
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
    const { rows, total } = yield* systemLogRepository.loadPage({
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
    yield* systemLogRepository.clearLogs();
  });

  const streamLogExportJson = Effect.fn("SystemLogService.streamLogExportJson")(function* (input: {
    endDate?: string;
    eventType?: string;
    level?: string;
    startDate?: string;
  }) {
    const plan = buildSystemLogExportPlan(input);
    const header = yield* systemLogRepository.loadExportHeader(plan, nowIso);

    return {
      header,
      stream: systemLogRepository.streamExportJson(plan),
    } satisfies SystemLogExportStreamShape;
  });

  const streamLogExportCsv = Effect.fn("SystemLogService.streamLogExportCsv")(function* (input: {
    endDate?: string;
    eventType?: string;
    level?: string;
    startDate?: string;
  }) {
    const plan = buildSystemLogExportPlan(input);
    const header = yield* systemLogRepository.loadExportHeader(plan, nowIso);

    return {
      header,
      stream: systemLogRepository.streamExportCsv(plan),
    } satisfies SystemLogExportStreamShape;
  });

  const triggerInfoEvent = Effect.fn("SystemLogService.triggerInfoEvent")(function* (
    message: string,
    eventType: string,
  ) {
    yield* systemLogRepository.appendLog(eventType, "info", message, nowIso);
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

export const SystemLogServiceLive = Layer.effect(SystemLogService, makeSystemLogService());
