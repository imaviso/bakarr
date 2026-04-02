import { sql } from "drizzle-orm";
import { Cause, Effect } from "effect";

import { backgroundJobs } from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

type NowIso = () => Effect.Effect<string>;

export const markJobStarted = Effect.fn("JobStatus.markJobStarted")(function* (
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

export const markJobSucceeded = Effect.fn("JobStatus.markJobSucceeded")(function* (
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

export const markJobFailed = Effect.fn("JobStatus.markJobFailed")(function* (
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

export function formatJobFailureMessage(cause: unknown): string {
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
