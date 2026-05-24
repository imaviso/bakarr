import { and, desc, eq, notInArray } from "drizzle-orm";
import { Effect, Schema } from "effect";

import { OperationTaskKeySchema } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { operationsTasks } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export type OperationsTaskKey = Schema.Schema.Type<typeof OperationTaskKeySchema>;

export type OperationsTaskRow = typeof operationsTasks.$inferSelect;

export interface OperationsTaskListQuery {
  readonly mediaId?: number;
  readonly excludeTaskKeys?: readonly OperationsTaskKey[];
  readonly limit: number;
  readonly offset: number;
  readonly taskKey?: OperationsTaskKey;
}

export interface OperationsTaskRepositoryShape {
  readonly completeFailedTaskRow: (input: {
    readonly finishedAt: string;
    readonly message: string;
    readonly payload: string | null;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError>;
  readonly completeSucceededTaskRow: (input: {
    readonly finishedAt: string;
    readonly message: string;
    readonly payload: string | null;
    readonly progressCurrent: number;
    readonly progressTotal: number;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError>;
  readonly createTaskRow: (input: {
    readonly createdAt: string;
    readonly mediaId?: number;
    readonly message: string;
    readonly taskKey: OperationsTaskKey;
  }) => Effect.Effect<number, DatabaseError>;
  readonly loadTaskRow: (
    taskId: number,
  ) => Effect.Effect<OperationsTaskRow | undefined, DatabaseError>;
  readonly listTaskRows: (
    input: OperationsTaskListQuery,
  ) => Effect.Effect<readonly OperationsTaskRow[], DatabaseError>;
  readonly markRunningTaskRow: (input: {
    readonly message: string;
    readonly startedAt: string;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError>;
  readonly updateTaskProgressRow: (input: {
    readonly message?: string;
    readonly progressCurrent: number;
    readonly progressTotal: number;
    readonly taskId: number;
    readonly updatedAt: string;
  }) => Effect.Effect<void, DatabaseError>;
}

export class OperationsTaskRepository extends Effect.Service<OperationsTaskRepository>()(
  "@bakarr/api/OperationsTaskRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeOperationsTaskRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export const createTaskRow = Effect.fn("OperationsTaskRepository.createTaskRow")(function* (
  db: AppDatabase,
  input: {
    readonly createdAt: string;
    readonly mediaId?: number;
    readonly message: string;
    readonly taskKey: OperationsTaskKey;
  },
) {
  const rows = yield* tryDatabasePromise("Failed to create operations task", () =>
    db
      .insert(operationsTasks)
      .values({
        mediaId: input.mediaId ?? null,
        createdAt: input.createdAt,
        finishedAt: null,
        message: input.message,
        payload: null,
        progressCurrent: 0,
        progressTotal: 100,
        startedAt: null,
        status: "queued",
        taskKey: input.taskKey,
        updatedAt: input.createdAt,
      })
      .returning({ id: operationsTasks.id }),
  );

  const created = rows[0];

  if (!created) {
    return yield* new DatabaseError({
      cause: new Error("Operations task insert returned no rows"),
      message: "Failed to create operations task",
    });
  }

  return created.id;
});

export const markRunningTaskRow = Effect.fn("OperationsTaskRepository.markRunningTaskRow")(
  function* (
    db: AppDatabase,
    input: { readonly message: string; readonly startedAt: string; readonly taskId: number },
  ) {
    yield* tryDatabasePromise("Failed to mark operations task running", () =>
      db
        .update(operationsTasks)
        .set({
          message: input.message,
          progressCurrent: 0,
          progressTotal: 100,
          startedAt: input.startedAt,
          status: "running",
          updatedAt: input.startedAt,
        })
        .where(eq(operationsTasks.id, input.taskId)),
    );
  },
);

export const updateTaskProgressRow = Effect.fn("OperationsTaskRepository.updateTaskProgressRow")(
  function* (
    db: AppDatabase,
    input: {
      readonly message?: string;
      readonly progressCurrent: number;
      readonly progressTotal: number;
      readonly taskId: number;
      readonly updatedAt: string;
    },
  ) {
    yield* tryDatabasePromise("Failed to update operations task progress", () =>
      db
        .update(operationsTasks)
        .set({
          ...(input.message === undefined ? {} : { message: input.message }),
          progressCurrent: input.progressCurrent,
          progressTotal: input.progressTotal,
          status: "running",
          updatedAt: input.updatedAt,
        })
        .where(eq(operationsTasks.id, input.taskId)),
    );
  },
);

export const completeSucceededTaskRow = Effect.fn(
  "OperationsTaskRepository.completeSucceededTaskRow",
)(function* (
  db: AppDatabase,
  input: {
    readonly finishedAt: string;
    readonly message: string;
    readonly payload: string | null;
    readonly progressCurrent: number;
    readonly progressTotal: number;
    readonly taskId: number;
  },
) {
  yield* tryDatabasePromise("Failed to mark operations task succeeded", () =>
    db
      .update(operationsTasks)
      .set({
        finishedAt: input.finishedAt,
        message: input.message,
        payload: input.payload,
        progressCurrent: input.progressCurrent,
        progressTotal: input.progressTotal,
        status: "succeeded",
        updatedAt: input.finishedAt,
      })
      .where(eq(operationsTasks.id, input.taskId)),
  );
});

export const completeFailedTaskRow = Effect.fn("OperationsTaskRepository.completeFailedTaskRow")(
  function* (
    db: AppDatabase,
    input: {
      readonly finishedAt: string;
      readonly message: string;
      readonly payload: string | null;
      readonly taskId: number;
    },
  ) {
    yield* tryDatabasePromise("Failed to mark operations task failed", () =>
      db
        .update(operationsTasks)
        .set({
          finishedAt: input.finishedAt,
          message: input.message,
          payload: input.payload,
          status: "failed",
          updatedAt: input.finishedAt,
        })
        .where(eq(operationsTasks.id, input.taskId)),
    );
  },
);

export const loadTaskRow = Effect.fn("OperationsTaskRepository.loadTaskRow")(function* (
  db: AppDatabase,
  taskId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load operations task", () =>
    db.select().from(operationsTasks).where(eq(operationsTasks.id, taskId)).limit(1),
  );
  return rows[0];
});

export const listTaskRows = Effect.fn("OperationsTaskRepository.listTaskRows")(function* (
  db: AppDatabase,
  input: OperationsTaskListQuery,
) {
  const filteredByAnimeId =
    input.mediaId === undefined ? undefined : eq(operationsTasks.mediaId, input.mediaId);
  const filteredByTaskKey =
    input.taskKey === undefined ? undefined : eq(operationsTasks.taskKey, input.taskKey);
  const filteredByExcludedTaskKeys =
    input.excludeTaskKeys === undefined || input.excludeTaskKeys.length === 0
      ? undefined
      : notInArray(operationsTasks.taskKey, [...input.excludeTaskKeys]);
  const conditions = [filteredByAnimeId, filteredByTaskKey, filteredByExcludedTaskKeys].filter(
    (condition) => condition !== undefined,
  );
  const whereClause =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  return yield* tryDatabasePromise("Failed to list operations tasks", () => {
    const stmt = db
      .select()
      .from(operationsTasks)
      .orderBy(desc(operationsTasks.id))
      .limit(input.limit)
      .offset(input.offset);
    return whereClause ? stmt.where(whereClause) : stmt;
  });
});

function makeOperationsTaskRepositoryShape(db: AppDatabase): OperationsTaskRepositoryShape {
  return {
    completeFailedTaskRow: (input) => completeFailedTaskRow(db, input),
    completeSucceededTaskRow: (input) => completeSucceededTaskRow(db, input),
    createTaskRow: (input) => createTaskRow(db, input),
    listTaskRows: (input) => listTaskRows(db, input),
    loadTaskRow: (taskId) => loadTaskRow(db, taskId),
    markRunningTaskRow: (input) => markRunningTaskRow(db, input),
    updateTaskProgressRow: (input) => updateTaskProgressRow(db, input),
  } satisfies OperationsTaskRepositoryShape;
}

export function makeOperationsTaskRepository(db: AppDatabase): OperationsTaskRepository {
  return OperationsTaskRepository.make(makeOperationsTaskRepositoryShape(db));
}
