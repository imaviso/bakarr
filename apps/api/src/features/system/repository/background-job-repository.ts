import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { backgroundJobs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { formatJobFailureMessage } from "@/infra/job-status.ts";

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
}

export class BackgroundJobRepository extends Effect.Service<BackgroundJobRepository>()(
  "@bakarr/api/BackgroundJobRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeBackgroundJobRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export function makeBackgroundJobRepository(db: AppDatabase): BackgroundJobRepository {
  return BackgroundJobRepository.make(makeBackgroundJobRepositoryShape(db));
}

function makeBackgroundJobRepositoryShape(db: AppDatabase): BackgroundJobRepositoryShape {
  return {
    loadByName: (name) => loadByName(db, name),
    markStarted: (name, nowIso) => markStarted(db, name, nowIso),
    markSucceeded: (name, message, nowIso) => markSucceeded(db, name, message, nowIso),
    markFailed: (name, cause, nowIso) => markFailed(db, name, cause, nowIso),
    updateProgress: (name, progressCurrent, progressTotal, nowIso, message) =>
      updateProgress(db, name, progressCurrent, progressTotal, nowIso, message),
  } satisfies BackgroundJobRepositoryShape;
}

const loadByName = Effect.fn("BackgroundJobRepository.loadByName")(function* (
  db: AppDatabase,
  name: string,
) {
  const rows = yield* tryDatabasePromise("Failed to load background job", () =>
    db.select().from(backgroundJobs).where(eq(backgroundJobs.name, name)).limit(1),
  );
  return rows[0];
});

const markStarted = Effect.fn("BackgroundJobRepository.markStarted")(function* <E>(
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

const markSucceeded = Effect.fn("BackgroundJobRepository.markSucceeded")(function* <E>(
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

const markFailed = Effect.fn("BackgroundJobRepository.markFailed")(function* <E>(
  db: AppDatabase,
  name: string,
  cause: unknown,
  nowIso: NowIso<E>,
) {
  yield* upsertJobStatus(db, name, nowIso, {
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

const upsertJobStatus = Effect.fn("BackgroundJobRepository.upsertJobStatus")(function* <E>(
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
