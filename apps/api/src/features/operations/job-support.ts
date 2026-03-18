import { and, eq, sql } from "drizzle-orm";

import type { DownloadSourceMetadata } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import {
  backgroundJobs,
  downloadEvents,
  downloads,
  episodes,
  systemLogs,
} from "../../db/schema.ts";
import { encodeDownloadEventMetadata } from "./repository.ts";

export function nowIso() {
  return new Date().toISOString();
}

export async function appendLog(
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

export async function recordDownloadEvent(
  db: AppDatabase,
  input: {
    animeId?: number;
    downloadId?: number;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    message: string;
    metadata?: string | null;
    metadataJson?: {
      covered_episodes?: readonly number[];
      imported_path?: string;
      source_metadata?: DownloadSourceMetadata;
    };
  },
) {
  await db.insert(downloadEvents).values({
    animeId: input.animeId ?? null,
    createdAt: nowIso(),
    downloadId: input.downloadId ?? null,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    message: input.message,
    metadata: input.metadataJson
      ? encodeDownloadEventMetadata(input.metadataJson)
      : (input.metadata ?? null),
    toStatus: input.toStatus ?? null,
  });
}

export async function markDownloadImported(
  db: AppDatabase,
  downloadId: number,
) {
  await db.update(downloads).set({
    externalState: "imported",
    progress: 100,
    status: "imported",
  }).where(eq(downloads.id, downloadId));
}

export async function markJobStarted(db: AppDatabase, name: string) {
  const now = nowIso();

  await db.insert(backgroundJobs).values({
    isRunning: true,
    lastMessage: null,
    lastRunAt: now,
    lastStatus: "running",
    lastSuccessAt: null,
    name,
    progressCurrent: null,
    progressTotal: null,
    runCount: 1,
  }).onConflictDoUpdate({
    target: backgroundJobs.name,
    set: {
      isRunning: true,
      lastMessage: null,
      lastRunAt: now,
      lastStatus: "running",
      progressCurrent: null,
      progressTotal: null,
      runCount: sql`${backgroundJobs.runCount} + 1`,
    },
  });
}

export async function markJobSucceeded(
  db: AppDatabase,
  name: string,
  message: string,
) {
  const now = nowIso();

  await db.insert(backgroundJobs).values({
    isRunning: false,
    lastMessage: message,
    lastRunAt: now,
    lastStatus: "success",
    lastSuccessAt: now,
    name,
    progressCurrent: null,
    progressTotal: null,
    runCount: 1,
  }).onConflictDoUpdate({
    target: backgroundJobs.name,
    set: {
      isRunning: false,
      lastMessage: message,
      lastRunAt: now,
      lastStatus: "success",
      lastSuccessAt: now,
      progressCurrent: null,
      progressTotal: null,
    },
  });
}

export async function markJobFailed(
  db: AppDatabase,
  name: string,
  cause: unknown,
) {
  const now = nowIso();
  const message = cause instanceof Error ? cause.message : String(cause);

  await db.insert(backgroundJobs).values({
    isRunning: false,
    lastMessage: message,
    lastRunAt: now,
    lastStatus: "failed",
    lastSuccessAt: null,
    name,
    progressCurrent: null,
    progressTotal: null,
    runCount: 1,
  }).onConflictDoUpdate({
    target: backgroundJobs.name,
    set: {
      isRunning: false,
      lastMessage: message,
      lastRunAt: now,
      lastStatus: "failed",
      progressCurrent: null,
      progressTotal: null,
    },
  });
}

export async function updateJobProgress(
  db: AppDatabase,
  name: string,
  progressCurrent: number,
  progressTotal: number,
  message?: string,
) {
  const now = nowIso();

  await db.insert(backgroundJobs).values({
    isRunning: true,
    lastMessage: message ?? null,
    lastRunAt: now,
    lastStatus: "running",
    lastSuccessAt: null,
    name,
    progressCurrent,
    progressTotal,
    runCount: 1,
  }).onConflictDoUpdate({
    target: backgroundJobs.name,
    set: {
      isRunning: true,
      lastMessage: message ?? null,
      lastRunAt: now,
      lastStatus: "running",
      progressCurrent,
      progressTotal,
    },
  });
}

export async function loadMissingEpisodeNumbers(
  db: AppDatabase,
  animeId: number,
): Promise<number[]> {
  const rows = await db.select().from(episodes).where(
    and(eq(episodes.animeId, animeId), eq(episodes.downloaded, false)),
  );
  return rows.map((row) => row.number).sort((left, right) => left - right);
}

export function randomHex(bytes: number) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
