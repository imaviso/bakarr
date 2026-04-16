import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";

import type {
  AsyncOperationAccepted,
  OperationTask,
  OperationTaskPayload,
} from "@packages/shared/index.ts";
import {
  AsyncOperationAcceptedSchema,
  OperationTaskKeySchema,
  OperationTaskSchema,
  OperationTaskPayloadSchema,
} from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { operationsTasks } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import {
  OperationsInfrastructureError,
  OperationsTaskNotFoundError,
} from "@/features/operations/errors.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type OperationsTaskKey = Schema.Schema.Type<typeof OperationTaskKeySchema>;

const OperationsTaskQuerySchema = Schema.Struct({
  animeId: Schema.optional(Schema.Number),
  taskKey: Schema.optional(OperationTaskKeySchema),
});

export interface OperationsTaskServiceShape {
  readonly completeFailedTask: (input: {
    readonly error: unknown;
    readonly message: string;
    readonly payload?: OperationTaskPayload;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError | OperationsInfrastructureError>;
  readonly completeSucceededTask: (input: {
    readonly message: string;
    readonly payload?: OperationTaskPayload;
    readonly progressCurrent?: number;
    readonly progressTotal?: number;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError | OperationsInfrastructureError>;
  readonly createTask: (input: {
    readonly animeId?: number;
    readonly message: string;
    readonly taskKey: OperationsTaskKey;
  }) => Effect.Effect<AsyncOperationAccepted, DatabaseError | OperationsInfrastructureError>;
  readonly getTask: (
    taskId: number,
  ) => Effect.Effect<
    OperationTask,
    DatabaseError | OperationsInfrastructureError | OperationsTaskNotFoundError
  >;
  readonly listTasks: (input?: {
    readonly animeId?: number;
    readonly taskKey?: OperationsTaskKey;
  }) => Effect.Effect<readonly OperationTask[], DatabaseError | OperationsInfrastructureError>;
  readonly markRunningTask: (input: {
    readonly message: string;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError | OperationsInfrastructureError>;
  readonly updateTaskProgress: (input: {
    readonly message?: string;
    readonly progressCurrent: number;
    readonly progressTotal: number;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError | OperationsInfrastructureError>;
}

export class OperationsTaskService extends Context.Tag("@bakarr/api/OperationsTaskService")<
  OperationsTaskService,
  OperationsTaskServiceShape
>() {}

export const decodeTaskPayload = Effect.fn("OperationsTaskService.decodeTaskPayload")(
  (value: string | null | undefined): Effect.Effect<OperationTaskPayload | null, OperationsInfrastructureError> =>
    value === undefined || value === null || value.length === 0
      ? Effect.succeed(null)
      : Schema.decodeUnknown(Schema.parseJson(OperationTaskPayloadSchema))(value).pipe(
          Effect.mapError(
            (cause) =>
              new OperationsInfrastructureError({
                message: "Stored operations task payload is invalid",
                cause,
              }),
          ),
        ),
);

export const encodeTaskPayload = Effect.fn("OperationsTaskService.encodeTaskPayload")(
  (payload: OperationTaskPayload | undefined): Effect.Effect<string, OperationsInfrastructureError> =>
    payload === undefined
      ? Effect.succeed("")
      : Schema.encodeUnknown(Schema.parseJson(OperationTaskPayloadSchema))(payload).pipe(
          Effect.mapError(
            (cause) =>
              new OperationsInfrastructureError({
                message: "Failed to encode operations task payload",
                cause,
              }),
          ),
        ),
);

const toOperationsTask = Effect.fn("OperationsTaskService.toOperationsTask")(function* (row: {
  readonly id: number;
  readonly taskKey: string;
  readonly status: string;
  readonly progressCurrent: number | null;
  readonly progressTotal: number | null;
  readonly message: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly updatedAt: string;
  readonly animeId: number | null;
  readonly payload: string | null;
}) {
  const payload = yield* decodeTaskPayload(row.payload);
  return yield* Schema.decodeUnknown(OperationTaskSchema)({
    id: row.id,
    task_key: row.taskKey,
    status: row.status,
    progress_current: row.progressCurrent ?? undefined,
    progress_total: row.progressTotal ?? undefined,
    message: row.message ?? undefined,
    created_at: row.createdAt,
    started_at: row.startedAt ?? undefined,
    finished_at: row.finishedAt ?? undefined,
    updated_at: row.updatedAt,
    anime_id: row.animeId ?? undefined,
    ...(payload === null ? {} : { payload }),
  }).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsInfrastructureError({
          message: "Stored operations task row is invalid",
          cause,
        }),
    ),
  );
});

const makeOperationsTaskService = Effect.gen(function* () {
  const { db } = yield* Database;
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const nowIso = () => nowIsoFromClock(clock);

  const createTask = Effect.fn("OperationsTaskService.createTask")(function* (input: {
    readonly animeId?: number;
    readonly message: string;
    readonly taskKey: OperationsTaskKey;
  }) {
    const createdAt = yield* nowIso();
    const rows = yield* tryDatabasePromise("Failed to create operations task", () =>
      db
        .insert(operationsTasks)
        .values({
          animeId: input.animeId ?? null,
          createdAt,
          finishedAt: null,
          message: input.message,
          payload: null,
          progressCurrent: 0,
          progressTotal: 100,
          startedAt: null,
          status: "queued",
          taskKey: input.taskKey,
          updatedAt: createdAt,
        })
        .returning({ id: operationsTasks.id }),
    );

    const created = rows[0];

    if (!created) {
      return yield* Effect.fail(
        new OperationsInfrastructureError({
          message: "Failed to create operations task",
        }),
      );
    }

    const accepted = {
      accepted_at: createdAt,
      message: input.message,
      status: "queued",
      task_id: created.id,
      task_key: input.taskKey,
    };

    const decodedAccepted = yield* Schema.decodeUnknown(AsyncOperationAcceptedSchema)(
      accepted,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsInfrastructureError({
            message: "Failed to build accepted operations task payload",
            cause,
          }),
      ),
    );

    yield* eventBus.publish({
      type: "Info",
      payload: {
        message: `${input.message} (task #${created.id})`,
      },
    });

    return decodedAccepted;
  });

  const markRunningTask = Effect.fn("OperationsTaskService.markRunningTask")(function* (input: {
    readonly message: string;
    readonly taskId: number;
  }) {
    const startedAt = yield* nowIso();
    yield* tryDatabasePromise("Failed to mark operations task running", () =>
      db
        .update(operationsTasks)
        .set({
          message: input.message,
          progressCurrent: 0,
          progressTotal: 100,
          startedAt,
          status: "running",
          updatedAt: startedAt,
        })
        .where(eq(operationsTasks.id, input.taskId)),
    );
  });

  const updateTaskProgress = Effect.fn("OperationsTaskService.updateTaskProgress")(
    function* (input: {
      readonly message?: string;
      readonly progressCurrent: number;
      readonly progressTotal: number;
      readonly taskId: number;
    }) {
      const updatedAt = yield* nowIso();
      yield* tryDatabasePromise("Failed to update operations task progress", () =>
        db
          .update(operationsTasks)
          .set({
            ...(input.message === undefined ? {} : { message: input.message }),
            progressCurrent: input.progressCurrent,
            progressTotal: input.progressTotal,
            status: "running",
            updatedAt,
          })
          .where(eq(operationsTasks.id, input.taskId)),
      );
    },
  );

  const completeSucceededTask = Effect.fn("OperationsTaskService.completeSucceededTask")(
    function* (input: {
      readonly message: string;
      readonly payload?: OperationTaskPayload;
      readonly progressCurrent?: number;
      readonly progressTotal?: number;
      readonly taskId: number;
    }) {
      const finishedAt = yield* nowIso();
      const payload = yield* encodeTaskPayload(input.payload);
      yield* tryDatabasePromise("Failed to mark operations task succeeded", () =>
        db
          .update(operationsTasks)
          .set({
            finishedAt,
            message: input.message,
            payload: payload.length === 0 ? null : payload,
            progressCurrent: input.progressCurrent ?? 100,
            progressTotal: input.progressTotal ?? 100,
            status: "succeeded",
            updatedAt: finishedAt,
          })
          .where(eq(operationsTasks.id, input.taskId)),
      );
    },
  );

  const completeFailedTask = Effect.fn("OperationsTaskService.completeFailedTask")(
    function* (input: {
      readonly error: unknown;
      readonly message: string;
      readonly payload?: OperationTaskPayload;
      readonly taskId: number;
    }) {
      const finishedAt = yield* nowIso();
      const errorMessage =
        input.error instanceof Error ? input.error.message : String(input.error);
      const payload = yield* encodeTaskPayload({
        ...(input.payload ?? {}),
        error: errorMessage,
      });

      yield* tryDatabasePromise("Failed to mark operations task failed", () =>
        db
          .update(operationsTasks)
          .set({
            finishedAt,
            message: input.message,
            payload: payload.length === 0 ? null : payload,
            status: "failed",
            updatedAt: finishedAt,
          })
          .where(eq(operationsTasks.id, input.taskId)),
      );
    },
  );

  const getTask = Effect.fn("OperationsTaskService.getTask")(function* (taskId: number) {
    const rows = yield* tryDatabasePromise("Failed to load operations task", () =>
      db.select().from(operationsTasks).where(eq(operationsTasks.id, taskId)).limit(1),
    );

    const [row] = rows;

    if (!row) {
      return yield* Effect.fail(
        new OperationsTaskNotFoundError({
          message: `Operations task ${taskId} not found`,
        }),
      );
    }

    return yield* toOperationsTask(row);
  });

  const listTasks = Effect.fn("OperationsTaskService.listTasks")(function* (input?: {
    readonly animeId?: number;
    readonly taskKey?: OperationsTaskKey;
  }) {
    const query = yield* Schema.decodeUnknown(OperationsTaskQuerySchema)(input ?? {}).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsInfrastructureError({
            message: "Invalid operations task list query",
            cause,
          }),
      ),
    );

    const whereClause =
      query.animeId !== undefined && query.taskKey !== undefined
        ? and(
            eq(operationsTasks.animeId, query.animeId),
            eq(operationsTasks.taskKey, query.taskKey),
          )
        : query.animeId !== undefined
          ? eq(operationsTasks.animeId, query.animeId)
          : query.taskKey !== undefined
            ? eq(operationsTasks.taskKey, query.taskKey)
            : undefined;
    const rows = yield* tryDatabasePromise("Failed to list operations tasks", () => {
      const query = db.select().from(operationsTasks).orderBy(desc(operationsTasks.id)).limit(100);
      return whereClause ? query.where(whereClause) : query;
    });

    return yield* Effect.forEach(rows, (row) => toOperationsTask(row));
  });

  return OperationsTaskService.of({
    completeFailedTask,
    completeSucceededTask,
    createTask,
    getTask,
    listTasks,
    markRunningTask,
    updateTaskProgress,
  });
});

export const OperationsTaskServiceLive = Layer.effect(
  OperationsTaskService,
  makeOperationsTaskService,
);

export const decodeOperationsTaskQuery = Effect.fn(
  "OperationsTaskService.decodeOperationsTaskQuery",
)(function* (input: {
  readonly anime_id?: number | undefined;
  readonly task_key?: string | undefined;
}) {
  const taskKeyOption = Option.fromNullable(input.task_key);

  const decodedTaskKey = Option.isNone(taskKeyOption)
    ? Option.none<OperationsTaskKey>()
    : Option.some(
        yield* Schema.decodeUnknown(OperationTaskKeySchema)(taskKeyOption.value).pipe(
          Effect.mapError(
            (cause) =>
              new OperationsInfrastructureError({
                message: "Invalid operations task key",
                cause,
              }),
          ),
        ),
      );

  return {
    ...(input.anime_id === undefined ? {} : { animeId: input.anime_id }),
    ...(Option.isSome(decodedTaskKey) ? { taskKey: decodedTaskKey.value } : {}),
  } as const;
});
