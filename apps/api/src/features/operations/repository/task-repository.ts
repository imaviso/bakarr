import { and, desc, eq, notInArray } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Context, Effect, Layer, Schema } from "effect";

import { OperationTaskKeySchema } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { operationsTasks } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";

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

export class OperationsTaskRepository extends Context.Service<
  OperationsTaskRepository,
  OperationsTaskRepositoryShape
>()("@bakarr/api/OperationsTaskRepository") {
  static readonly layer = Layer.effect(
    OperationsTaskRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeOperationsTaskRepositoryShape(db, sqlClient);
    }),
  );
}

export const createTaskRow = Effect.fn("OperationsTaskRepository.createTaskRow")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly createdAt: string;
    readonly mediaId?: number;
    readonly message: string;
    readonly taskKey: OperationsTaskKey;
  },
) {
  const rows = yield* exec.runQuery(
    "Failed to create operations task",
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
      .returning({ id: operationsTasks.id })
      .prepare()
      .effect(),
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
    exec: DbExecutor,
    input: { readonly message: string; readonly startedAt: string; readonly taskId: number },
  ) {
    yield* exec.runQuery(
      "Failed to mark operations task running",
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
        .where(eq(operationsTasks.id, input.taskId))
        .prepare()
        .effect(),
    );
  },
);

export const updateTaskProgressRow = Effect.fn("OperationsTaskRepository.updateTaskProgressRow")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: {
      readonly message?: string;
      readonly progressCurrent: number;
      readonly progressTotal: number;
      readonly taskId: number;
      readonly updatedAt: string;
    },
  ) {
    yield* exec.runQuery(
      "Failed to update operations task progress",
      db
        .update(operationsTasks)
        .set({
          ...(input.message === undefined ? {} : { message: input.message }),
          progressCurrent: input.progressCurrent,
          progressTotal: input.progressTotal,
          status: "running",
          updatedAt: input.updatedAt,
        })
        .where(eq(operationsTasks.id, input.taskId))
        .prepare()
        .effect(),
    );
  },
);

export const completeSucceededTaskRow = Effect.fn(
  "OperationsTaskRepository.completeSucceededTaskRow",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly finishedAt: string;
    readonly message: string;
    readonly payload: string | null;
    readonly progressCurrent: number;
    readonly progressTotal: number;
    readonly taskId: number;
  },
) {
  yield* exec.runQuery(
    "Failed to mark operations task succeeded",
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
      .where(eq(operationsTasks.id, input.taskId))
      .prepare()
      .effect(),
  );
});

export const completeFailedTaskRow = Effect.fn("OperationsTaskRepository.completeFailedTaskRow")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: {
      readonly finishedAt: string;
      readonly message: string;
      readonly payload: string | null;
      readonly taskId: number;
    },
  ) {
    yield* exec.runQuery(
      "Failed to mark operations task failed",
      db
        .update(operationsTasks)
        .set({
          finishedAt: input.finishedAt,
          message: input.message,
          payload: input.payload,
          status: "failed",
          updatedAt: input.finishedAt,
        })
        .where(eq(operationsTasks.id, input.taskId))
        .prepare()
        .effect(),
    );
  },
);

export const loadTaskRow = Effect.fn("OperationsTaskRepository.loadTaskRow")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  taskId: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to load operations task",
    db
      .select()
      .from(operationsTasks)
      .where(eq(operationsTasks.id, taskId))
      .limit(1)
      .prepare()
      .effect(),
  );
  return rows[0];
});

export const listTaskRows = Effect.fn("OperationsTaskRepository.listTaskRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
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

  return yield* (function () {
    const stmt = db
      .select()
      .from(operationsTasks)
      .orderBy(desc(operationsTasks.id))
      .limit(input.limit)
      .offset(input.offset);
    const __q = whereClause ? stmt.where(whereClause) : stmt;
    return exec.runQuery("Failed to list operations tasks", __q.prepare().effect());
  })();
});

export function makeOperationsTaskRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): OperationsTaskRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    completeFailedTaskRow: (input) => completeFailedTaskRow(db, exec, input),
    completeSucceededTaskRow: (input) => completeSucceededTaskRow(db, exec, input),
    createTaskRow: (input) => createTaskRow(db, exec, input),
    listTaskRows: (input) => listTaskRows(db, exec, input),
    loadTaskRow: (taskId) => loadTaskRow(db, exec, taskId),
    markRunningTaskRow: (input) => markRunningTaskRow(db, exec, input),
    updateTaskProgressRow: (input) => updateTaskProgressRow(db, exec, input),
  } satisfies OperationsTaskRepositoryShape;
}
