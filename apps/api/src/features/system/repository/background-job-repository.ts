import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { backgroundJobs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  markJobFailed as markJobFailedBase,
  markJobStarted as markJobStartedBase,
  markJobSucceeded as markJobSucceededBase,
  updateJobProgress as updateJobProgressBase,
} from "@/infra/job-status.ts";

type NowIso<E = never> = () => Effect.Effect<string, E>;
type BackgroundJobRow = typeof backgroundJobs.$inferSelect;

export interface BackgroundJobRepositoryShape {
  readonly loadByName: (
    name: string,
  ) => Effect.Effect<BackgroundJobRow | undefined, DatabaseError>;
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

export function makeBackgroundJobRepository(db: AppDatabase): BackgroundJobRepository {
  return BackgroundJobRepository.make(makeBackgroundJobRepositoryShape(db));
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
  yield* markJobStartedBase(db, name, nowIso);
});

const markSucceeded = Effect.fn("BackgroundJobRepository.markSucceeded")(function* <E>(
  db: AppDatabase,
  name: string,
  message: string,
  nowIso: NowIso<E>,
) {
  yield* markJobSucceededBase(db, name, message, nowIso);
});

const markFailed = Effect.fn("BackgroundJobRepository.markFailed")(function* <E>(
  db: AppDatabase,
  name: string,
  cause: unknown,
  nowIso: NowIso<E>,
) {
  yield* markJobFailedBase(db, name, cause, nowIso);
});

const updateProgress = Effect.fn("BackgroundJobRepository.updateProgress")(function* <E>(
  db: AppDatabase,
  name: string,
  progressCurrent: number,
  progressTotal: number,
  nowIso: NowIso<E>,
  message?: string,
) {
  yield* updateJobProgressBase(db, name, progressCurrent, progressTotal, nowIso, message);
});
