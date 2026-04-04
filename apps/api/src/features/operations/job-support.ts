import { and, eq, sql } from "drizzle-orm";
import { Cause, Effect } from "effect";

import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { backgroundJobs, downloadEvents, downloads, episodes, systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { encodeDownloadEventMetadata } from "@/features/operations/repository/download-repository.ts";

type NowIso = () => Effect.Effect<string>;

export const appendLog = Effect.fn("JobSupport.appendLog")(function* (
  db: AppDatabase,
  eventType: string,
  level: string,
  message: string,
  nowIso: NowIso,
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
  nowIso: NowIso,
) {
  const now = yield* nowIso();
  const metadata = input.metadataJson
    ? yield* encodeDownloadEventMetadata(input.metadataJson)
    : (input.metadata ?? null);

  yield* tryDatabasePromise("Failed to record download event", () =>
    db.insert(downloadEvents).values({
      animeId: input.animeId ?? null,
      createdAt: now,
      downloadId: input.downloadId ?? null,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      message: input.message,
      metadata,
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
  nowIso: NowIso,
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
  nowIso: NowIso,
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
  nowIso: NowIso,
) {
  const now = yield* nowIso();
  const message = formatJobFailureMessage(cause);

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

function formatJobFailureMessage(cause: unknown): string {
  if (Cause.isCause(cause)) {
    return Cause.pretty(cause);
  }

  if (
    typeof cause === "object" &&
    cause !== null &&
    "_tag" in cause &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return `${String(cause._tag)}: ${cause.message}`;
  }

  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }

  return String(cause);
}

export const updateJobProgress = Effect.fn("JobSupport.updateJobProgress")(function* (
  db: AppDatabase,
  name: string,
  progressCurrent: number,
  progressTotal: number,
  nowIso: NowIso,
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
