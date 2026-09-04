// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { eq, sql } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { backgroundJobs } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { formatJobFailureMessage } from "@/background/job-status.ts";
import { Context, Effect, Layer } from "effect";

type NowIso<E = never> = () => Effect.Effect<string, E>;
type BackgroundJobRow = typeof backgroundJobs.$inferSelect;

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

export interface BackgroundJobRepositoryShape {
  readonly loadByName: (name: string) => Effect.Effect<BackgroundJobRow | undefined, DatabaseError>;
  readonly markStarted: <E>(
    name: string,
    nowIso: NowIso<E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly markSucceeded: <E>(
    name: string,
    message: string,
    nowIso: NowIso<E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly markFailed: <E>(
    name: string,
    cause: unknown,
    nowIso: NowIso<E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly updateProgress: <E>(
    name: string,
    progressCurrent: number,
    progressTotal: number,
    nowIso: NowIso<E>,
    message?: string,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly clearStaleRunningJobs: () => Effect.Effect<void, DatabaseError>;
}

export class BackgroundJobRepository extends Context.Service<
  BackgroundJobRepository,
  BackgroundJobRepositoryShape
>()("@bakarr/api/BackgroundJobRepository") {
  static readonly layer = Layer.effect(
    BackgroundJobRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeBackgroundJobRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeBackgroundJobRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): BackgroundJobRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    clearStaleRunningJobs: () => clearStaleRunningJobs(db, exec),
    loadByName: (name) => loadByName(db, exec, name),
    markStarted: (name, nowIso) => markStarted(db, exec, name, nowIso),
    markSucceeded: (name, message, nowIso) => markSucceeded(db, exec, name, message, nowIso),
    markFailed: (name, cause, nowIso) => markFailed(db, exec, name, cause, nowIso),
    updateProgress: (name, progressCurrent, progressTotal, nowIso, message) =>
      updateProgress(db, exec, name, progressCurrent, progressTotal, nowIso, message),
  } satisfies BackgroundJobRepositoryShape;
}

/**
 * Startup recovery: rows left with is_running=true by a crash or kill have no
 * live worker behind them. Called once during bootstrap before workers start.
 */
const clearStaleRunningJobs = Effect.fn("BackgroundJobRepository.clearStaleRunningJobs")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  yield* exec.runQuery(
    "Failed to clear stale running jobs",
    db
      .update(backgroundJobs)
      .set({
        isRunning: false,
        lastMessage: "Interrupted by application restart",
        lastStatus: "failed",
      })
      .where(eq(backgroundJobs.isRunning, true))
      .prepare()
      .effect(),
  );
});

const loadByName = Effect.fn("BackgroundJobRepository.loadByName")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  name: string,
) {
  const rows = yield* exec.runQuery(
    "Failed to load background job",
    db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.name, name))
      .limit(1)
      .prepare()
      .effect(),
  );
  return rows[0];
});

const markStarted = Effect.fn("BackgroundJobRepository.markStarted")(function* <E>(
  db: AppDatabase,
  exec: DbExecutor,
  name: string,
  nowIso: NowIso<E>,
) {
  yield* upsertJobStatus(db, exec, name, nowIso, {
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

const markSucceeded = Effect.fn("BackgroundJobRepository.markSucceeded")(function* <E>(
  db: AppDatabase,
  exec: DbExecutor,
  name: string,
  message: string,
  nowIso: NowIso<E>,
) {
  const now = yield* nowIso();

  yield* upsertJobStatus(db, exec, name, () => Effect.succeed(now), {
    errorMessage: "Failed to mark job succeeded",
    isRunning: false,
    lastMessage: message,
    lastStatus: "success",
    lastSuccessAt: now,
    progressCurrent: null,
    progressTotal: null,
  });
});

const markFailed = Effect.fn("BackgroundJobRepository.markFailed")(function* <E>(
  db: AppDatabase,
  exec: DbExecutor,
  name: string,
  cause: unknown,
  nowIso: NowIso<E>,
) {
  yield* upsertJobStatus(db, exec, name, nowIso, {
    errorMessage: "Failed to mark job failed",
    isRunning: false,
    lastMessage: formatJobFailureMessage(cause),
    lastStatus: "failed",
    lastSuccessAt: null,
    progressCurrent: null,
    progressTotal: null,
  });
});

const updateProgress = Effect.fn("BackgroundJobRepository.updateProgress")(function* <E>(
  db: AppDatabase,
  exec: DbExecutor,
  name: string,
  progressCurrent: number,
  progressTotal: number,
  nowIso: NowIso<E>,
  message?: string,
) {
  yield* upsertJobStatus(db, exec, name, nowIso, {
    errorMessage: "Failed to update job progress",
    isRunning: true,
    lastMessage: message ?? null,
    lastStatus: "running",
    lastSuccessAt: null,
    progressCurrent,
    progressTotal,
  });
});

const upsertJobStatus = Effect.fn("BackgroundJobRepository.upsertJobStatus")(function* <E>(
  db: AppDatabase,
  exec: DbExecutor,
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

  yield* exec.runQuery(
    input.errorMessage,
    db
      .insert(backgroundJobs)
      .values(insertValues)
      .onConflictDoUpdate({
        target: backgroundJobs.name,
        set: updateValues,
      })
      .prepare()
      .effect(),
  );
});
