import { eq, sql } from "drizzle-orm";

import type { AppDatabase } from "../../db/database.ts";
import { systemLogs } from "../../db/schema.ts";

export function normalizeLevel(level: string): "info" | "warn" | "error" | "success" {
  if (level === "warn" || level === "error" || level === "success") {
    return level;
  }

  return "info";
}

export function eventTypeCondition(eventType: string) {
  switch (eventType) {
    case "Scan":
      return sql`${systemLogs.eventType} like 'library.%' or ${systemLogs.eventType} like 'anime.%scan%' or ${systemLogs.eventType} like 'system.task.scan%'`;
    case "Download":
      return sql`${systemLogs.eventType} like 'downloads.%'`;
    case "Import":
      return sql`${systemLogs.eventType} like 'library.%import%'`;
    case "RSS":
      return sql`${systemLogs.eventType} like 'rss.%' or ${systemLogs.eventType} like 'system.task.rss%'`;
    case "Error":
      return eq(systemLogs.level, "error");
    default:
      return eq(systemLogs.eventType, eventType);
  }
}

export async function appendSystemLog(
  db: AppDatabase,
  eventType: string,
  level: string,
  message: string,
) {
  await db.insert(systemLogs).values({
    createdAt: nowIso(),
    details: null,
    eventType,
    level,
    message,
  });
}

export function getDiskSpaceSafe(_path: string) {
  return {
    free: 0,
    total: 0,
  };
}

export function nowIso() {
  return new Date().toISOString();
}
