import { sql } from "drizzle-orm";
import { Cause, Effect } from "effect";

import { backgroundJobs } from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

type NowIso<E = never> = () => Effect.Effect<string, E>;

interface JobUpsertInput {
  readonly errorMessage: string;
  readonly isRunning: boolean;
  readonly lastMessage: string | null;
  readonly lastStatus: "failed" | "running" | "success";
  readonly lastSuccessAt: string | null;
  readonly progressCurrent: number | null;
  readonly progressTotal: number | null;
  readonly incrementRunCount?: boolean;
}

const upsertJobStatus = Effect.fn("JobStatus.upsertJobStatus")(function* <E>(
  db: AppDatabase,
  name: string,
  nowIso: NowIso<E>,
  input: JobUpsertInput,
) {
  const now = yield* nowIso();
  const insertValues = {
    isRunning: input.isRunning,
    lastMessage: input.lastMessage,
    lastRunAt: now,
    lastStatus: input.lastStatus,
    lastSuccessAt: input.lastSuccessAt,
    name,
    progressCurrent: input.progressCurrent,
    progressTotal: input.progressTotal,
    runCount: 1,
  };
  const updateValues = {
    isRunning: input.isRunning,
    lastMessage: input.lastMessage,
    lastRunAt: now,
    lastStatus: input.lastStatus,
    lastSuccessAt: input.lastSuccessAt,
    progressCurrent: input.progressCurrent,
    progressTotal: input.progressTotal,
    ...(input.incrementRunCount ? { runCount: sql`${backgroundJobs.runCount} + 1` } : {}),
  };

  yield* tryDatabasePromise(input.errorMessage, () =>
    db.insert(backgroundJobs).values(insertValues).onConflictDoUpdate({
      target: backgroundJobs.name,
      set: updateValues,
    }),
  );
});

export const markJobStarted = Effect.fn("JobStatus.markJobStarted")(function* <E>(
  db: AppDatabase,
  name: string,
  nowIso: NowIso<E>,
) {
  yield* upsertJobStatus(db, name, nowIso, {
    errorMessage: "Failed to mark job started",
    isRunning: true,
    lastMessage: null,
    lastStatus: "running",
    lastSuccessAt: null,
    progressCurrent: null,
    progressTotal: null,
    incrementRunCount: true,
  });
});

export const markJobSucceeded = Effect.fn("JobStatus.markJobSucceeded")(function* <E>(
  db: AppDatabase,
  name: string,
  message: string,
  nowIso: NowIso<E>,
) {
  const now = yield* nowIso();

  yield* upsertJobStatus(db, name, () => Effect.succeed(now), {
    errorMessage: "Failed to mark job succeeded",
    isRunning: false,
    lastMessage: message,
    lastStatus: "success",
    lastSuccessAt: now,
    progressCurrent: null,
    progressTotal: null,
  });
});

export const markJobFailed = Effect.fn("JobStatus.markJobFailed")(function* <E>(
  db: AppDatabase,
  name: string,
  cause: unknown,
  nowIso: NowIso<E>,
) {
  const message = formatJobFailureMessage(cause);

  yield* upsertJobStatus(db, name, nowIso, {
    errorMessage: "Failed to mark job failed",
    isRunning: false,
    lastMessage: message,
    lastStatus: "failed",
    lastSuccessAt: null,
    progressCurrent: null,
    progressTotal: null,
  });
});

export const updateJobProgress = Effect.fn("JobStatus.updateJobProgress")(function* <E>(
  db: AppDatabase,
  name: string,
  progressCurrent: number,
  progressTotal: number,
  nowIso: NowIso<E>,
  message?: string,
) {
  yield* upsertJobStatus(db, name, nowIso, {
    errorMessage: "Failed to update job progress",
    isRunning: true,
    lastMessage: message ?? null,
    lastStatus: "running",
    lastSuccessAt: null,
    progressCurrent,
    progressTotal,
  });
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
