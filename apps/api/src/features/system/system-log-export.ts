import { sql, type SQL } from "drizzle-orm";
import { Stream } from "effect";

import { brandSystemLogId, type SystemLog } from "@packages/shared/index.ts";
import { systemLogs } from "@/db/schema.ts";
import type { DatabaseError } from "@/db/database.ts";
import { eventTypeCondition, normalizeLevel } from "@/features/system/support.ts";

const EXPORT_LIMIT = 10_000;
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

export interface SystemLogExportPlan {
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
    id: brandSystemLogId(row.id),
    level: normalizeLevel(row.level),
    message: row.message,
  } satisfies SystemLog;
}

export function encodeLogExportJsonStream(
  rowStream: Stream.Stream<SystemLog, DatabaseError>,
): Stream.Stream<Uint8Array, DatabaseError> {
  const prefix = textEncoder.encode("[");
  const suffix = textEncoder.encode("]");
  const body = rowStream.pipe(
    Stream.zipWithIndex,
    Stream.map(([log, index]) =>
      textEncoder.encode(`${index === 0 ? "" : ","}${JSON.stringify(log)}`),
    ),
  );

  return Stream.concat(
    Stream.fromIterable([prefix]),
    Stream.concat(body, Stream.fromIterable([suffix])),
  );
}

export function encodeLogExportCsvStream(
  rowStream: Stream.Stream<SystemLog, DatabaseError>,
): Stream.Stream<Uint8Array, DatabaseError> {
  const csvHeader = textEncoder.encode("id,level,event_type,message,created_at\n");
  const body = rowStream.pipe(
    Stream.map((log) =>
      textEncoder.encode(
        `${log.id},${log.level},${escapeCsv(log.event_type)},${escapeCsv(log.message)},${log.created_at}\n`,
      ),
    ),
  );

  return Stream.concat(Stream.fromIterable([csvHeader]), body);
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
