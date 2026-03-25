import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { DownloadSourceMetadata } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import {
  backgroundJobs,
  downloadEvents,
  downloads,
  episodes,
  systemLogs,
} from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { encodeDownloadEventMetadata } from "./repository.ts";

type NowIso = () => Effect.Effect<string>;
const liveNowIso: NowIso = () => Effect.sync(() => new Date().toISOString());

export const appendLog = Effect.fn("JobSupport.appendLog")(function* (
  db: AppDatabase,
  eventType: string,
  level: string,
  message: string,
  nowIso: NowIso = liveNowIso,
) {
  const now = yield* nowIso();
  yield* tryDatabasePromise("Failed to append log", () =>
    db.insert(systemLogs).values({
      createdAt: now,
      details: null,
      eventType,
      level,
      message,
    }),
  );
});

export const recordDownloadEvent = Effect.fn("JobSupport.recordDownloadEvent")(function* (
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
  nowIso: NowIso = liveNowIso,
) {
  const now = yield* nowIso();
  yield* tryDatabasePromise("Failed to record download event", () =>
    db.insert(downloadEvents).values({
      animeId: input.animeId ?? null,
      createdAt: now,
      downloadId: input.downloadId ?? null,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      message: input.message,
      metadata: input.metadataJson
        ? encodeDownloadEventMetadata(input.metadataJson)
        : (input.metadata ?? null),
      toStatus: input.toStatus ?? null,
    }),
  );
});

export const markDownloadImported = Effect.fn("JobSupport.markDownloadImported")(function* (
  db: AppDatabase,
  downloadId: number,
) {
  yield* tryDatabasePromise("Failed to mark download imported", () =>
    db
      .update(downloads)
      .set({
        externalState: "imported",
        progress: 100,
        status: "imported",
      })
      .where(eq(downloads.id, downloadId)),
  );
});

export const markJobStarted = Effect.fn("JobSupport.markJobStarted")(function* (
  db: AppDatabase,
  name: string,
  nowIso: NowIso = liveNowIso,
) {
  const now = yield* nowIso();

  yield* tryDatabasePromise("Failed to mark job started", () =>
    db
      .insert(backgroundJobs)
      .values({
        isRunning: true,
        lastMessage: null,
        lastRunAt: now,
        lastStatus: "running",
        lastSuccessAt: null,
        name,
        progressCurrent: null,
        progressTotal: null,
        runCount: 1,
      })
      .onConflictDoUpdate({
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
      }),
  );
});

export const markJobSucceeded = Effect.fn("JobSupport.markJobSucceeded")(function* (
  db: AppDatabase,
  name: string,
  message: string,
  nowIso: NowIso = liveNowIso,
) {
  const now = yield* nowIso();

  yield* tryDatabasePromise("Failed to mark job succeeded", () =>
    db
      .insert(backgroundJobs)
      .values({
        isRunning: false,
        lastMessage: message,
        lastRunAt: now,
        lastStatus: "success",
        lastSuccessAt: now,
        name,
        progressCurrent: null,
        progressTotal: null,
        runCount: 1,
      })
      .onConflictDoUpdate({
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
      }),
  );
});

export const markJobFailed = Effect.fn("JobSupport.markJobFailed")(function* (
  db: AppDatabase,
  name: string,
  cause: unknown,
  nowIso: NowIso = liveNowIso,
) {
  const now = yield* nowIso();
  const message = cause instanceof Error ? cause.message : String(cause);

  yield* tryDatabasePromise("Failed to mark job failed", () =>
    db
      .insert(backgroundJobs)
      .values({
        isRunning: false,
        lastMessage: message,
        lastRunAt: now,
        lastStatus: "failed",
        lastSuccessAt: null,
        name,
        progressCurrent: null,
        progressTotal: null,
        runCount: 1,
      })
      .onConflictDoUpdate({
        target: backgroundJobs.name,
        set: {
          isRunning: false,
          lastMessage: message,
          lastRunAt: now,
          lastStatus: "failed",
          progressCurrent: null,
          progressTotal: null,
        },
      }),
  );
});

export const updateJobProgress = Effect.fn("JobSupport.updateJobProgress")(function* (
  db: AppDatabase,
  name: string,
  progressCurrent: number,
  progressTotal: number,
  nowIso: NowIso = liveNowIso,
  message?: string,
) {
  const now = yield* nowIso();

  yield* tryDatabasePromise("Failed to update job progress", () =>
    db
      .insert(backgroundJobs)
      .values({
        isRunning: true,
        lastMessage: message ?? null,
        lastRunAt: now,
        lastStatus: "running",
        lastSuccessAt: null,
        name,
        progressCurrent,
        progressTotal,
        runCount: 1,
      })
      .onConflictDoUpdate({
        target: backgroundJobs.name,
        set: {
          isRunning: true,
          lastMessage: message ?? null,
          lastRunAt: now,
          lastStatus: "running",
          progressCurrent,
          progressTotal,
        },
      }),
  );
});

export const loadMissingEpisodeNumbers = Effect.fn("JobSupport.loadMissingEpisodeNumbers")(
  function* (db: AppDatabase, animeId: number) {
    const rows = yield* tryDatabasePromise("Failed to load missing episode numbers", () =>
      db
        .select()
        .from(episodes)
        .where(and(eq(episodes.animeId, animeId), eq(episodes.downloaded, false))),
    );
    return rows.map((row) => row.number).sort((left, right) => left - right);
  },
);
