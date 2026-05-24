import { Effect, Option, Schema } from "effect";

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
import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { OperationsNotFoundError } from "@/features/operations/errors.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { OperationsTaskRepository } from "@/features/operations/repository/task-repository.ts";

export type OperationsTaskKey = Schema.Schema.Type<typeof OperationTaskKeySchema>;

class OperationsTaskQuery extends Schema.Class<OperationsTaskQuery>("OperationsTaskQuery")({
  mediaId: Schema.optional(Schema.Number),
  excludeTaskKeys: Schema.optional(Schema.Array(OperationTaskKeySchema)),
  limit: Schema.optional(Schema.Number),
  offset: Schema.optional(Schema.Number),
  taskKey: Schema.optional(OperationTaskKeySchema),
}) {}

export interface OperationsTaskWriteServiceShape {
  readonly completeFailedTask: (input: {
    readonly error: unknown;
    readonly message: string;
    readonly payload?: OperationTaskPayload;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError | InfrastructureError>;
  readonly completeSucceededTask: (input: {
    readonly message: string;
    readonly payload?: OperationTaskPayload;
    readonly progressCurrent?: number;
    readonly progressTotal?: number;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError | InfrastructureError>;
  readonly createTask: (input: {
    readonly mediaId?: number;
    readonly message: string;
    readonly taskKey: OperationsTaskKey;
  }) => Effect.Effect<AsyncOperationAccepted, DatabaseError | InfrastructureError>;
  readonly markRunningTask: (input: {
    readonly message: string;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError | InfrastructureError>;
  readonly updateTaskProgress: (input: {
    readonly message?: string;
    readonly progressCurrent: number;
    readonly progressTotal: number;
    readonly taskId: number;
  }) => Effect.Effect<void, DatabaseError | InfrastructureError>;
}

export interface OperationsTaskReadServiceShape {
  readonly getTask: (
    taskId: number,
  ) => Effect.Effect<OperationTask, DatabaseError | InfrastructureError | OperationsNotFoundError>;
  readonly listTasks: (input?: {
    readonly mediaId?: number;
    readonly excludeTaskKeys?: readonly OperationsTaskKey[];
    readonly limit?: number;
    readonly offset?: number;
    readonly taskKey?: OperationsTaskKey;
  }) => Effect.Effect<readonly OperationTask[], DatabaseError | InfrastructureError>;
}

export const decodeTaskPayload = Effect.fn("OperationsTaskService.decodeTaskPayload")(
  (
    value: string | null | undefined,
  ): Effect.Effect<OperationTaskPayload | null, InfrastructureError> =>
    value === undefined || value === null || value.length === 0
      ? Effect.succeed(null)
      : Schema.decodeUnknown(Schema.parseJson(OperationTaskPayloadSchema))(value).pipe(
          Effect.mapError(
            (cause) =>
              new InfrastructureError({
                message: "Stored operations task payload is invalid",
                cause,
              }),
          ),
        ),
);

export const encodeTaskPayload = Effect.fn("OperationsTaskService.encodeTaskPayload")(
  (payload: OperationTaskPayload | undefined): Effect.Effect<string, InfrastructureError> =>
    payload === undefined
      ? Effect.succeed("")
      : Schema.encodeUnknown(Schema.parseJson(OperationTaskPayloadSchema))(payload).pipe(
          Effect.mapError(
            (cause) =>
              new InfrastructureError({
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
  readonly mediaId: number | null;
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
    media_id: row.mediaId ?? undefined,
    ...(payload === null ? {} : { payload }),
  }).pipe(
    Effect.mapError(
      (cause) =>
        new InfrastructureError({
          message: "Stored operations task row is invalid",
          cause,
        }),
    ),
  );
});

const makeOperationsTaskWriteService = Effect.fn("OperationsTaskWriteService.make")(function* () {
  const repository = yield* OperationsTaskRepository;
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const nowIso = () => nowIsoFromClock(clock);

  const createTask = Effect.fn("OperationsTaskWriteService.createTask")(function* (input: {
    readonly mediaId?: number;
    readonly message: string;
    readonly taskKey: OperationsTaskKey;
  }) {
    const createdAt = yield* nowIso();
    const taskId = yield* repository.createTaskRow({
      createdAt,
      ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
      message: input.message,
      taskKey: input.taskKey,
    });

    const accepted = {
      accepted_at: createdAt,
      message: input.message,
      status: "queued",
      task_id: taskId,
      task_key: input.taskKey,
    };

    const decodedAccepted = yield* Schema.decodeUnknown(AsyncOperationAcceptedSchema)(
      accepted,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new InfrastructureError({
            message: "Failed to build accepted operations task payload",
            cause,
          }),
      ),
    );

    yield* eventBus.publish({
      type: "Info",
      payload: {
        message: `${input.message} (task #${taskId})`,
      },
    });

    return decodedAccepted;
  });

  const markRunningTask = Effect.fn("OperationsTaskWriteService.markRunningTask")(
    function* (input: { readonly message: string; readonly taskId: number }) {
      const startedAt = yield* nowIso();
      yield* repository.markRunningTaskRow({ ...input, startedAt });
    },
  );

  const updateTaskProgress = Effect.fn("OperationsTaskWriteService.updateTaskProgress")(
    function* (input: {
      readonly message?: string;
      readonly progressCurrent: number;
      readonly progressTotal: number;
      readonly taskId: number;
    }) {
      const updatedAt = yield* nowIso();
      yield* repository.updateTaskProgressRow({ ...input, updatedAt });
    },
  );

  const completeSucceededTask = Effect.fn("OperationsTaskWriteService.completeSucceededTask")(
    function* (input: {
      readonly message: string;
      readonly payload?: OperationTaskPayload;
      readonly progressCurrent?: number;
      readonly progressTotal?: number;
      readonly taskId: number;
    }) {
      const finishedAt = yield* nowIso();
      const payload = yield* encodeTaskPayload(input.payload);
      yield* repository.completeSucceededTaskRow({
        finishedAt,
        message: input.message,
        payload: payload.length === 0 ? null : payload,
        progressCurrent: input.progressCurrent ?? 100,
        progressTotal: input.progressTotal ?? 100,
        taskId: input.taskId,
      });
    },
  );

  const completeFailedTask = Effect.fn("OperationsTaskWriteService.completeFailedTask")(
    function* (input: {
      readonly error: unknown;
      readonly message: string;
      readonly payload?: OperationTaskPayload;
      readonly taskId: number;
    }) {
      const finishedAt = yield* nowIso();
      const errorMessage = input.error instanceof Error ? input.error.message : String(input.error);
      const payload = yield* encodeTaskPayload({
        ...input.payload,
        error: errorMessage,
      });

      yield* repository.completeFailedTaskRow({
        finishedAt,
        message: input.message,
        payload: payload.length === 0 ? null : payload,
        taskId: input.taskId,
      });
    },
  );

  return {
    completeFailedTask,
    completeSucceededTask,
    createTask,
    markRunningTask,
    updateTaskProgress,
  } satisfies OperationsTaskWriteServiceShape;
});

const makeOperationsTaskReadService = Effect.fn("OperationsTaskReadService.make")(function* () {
  const repository = yield* OperationsTaskRepository;

  const getTask = Effect.fn("OperationsTaskReadService.getTask")(function* (taskId: number) {
    const row = yield* repository.loadTaskRow(taskId);

    if (!row) {
      return yield* new OperationsNotFoundError({
        message: `Operations task ${taskId} not found`,
      });
    }

    return yield* toOperationsTask(row);
  });

  const listTasks = Effect.fn("OperationsTaskReadService.listTasks")(function* (input?: {
    readonly mediaId?: number;
    readonly excludeTaskKeys?: readonly OperationsTaskKey[];
    readonly limit?: number;
    readonly offset?: number;
    readonly taskKey?: OperationsTaskKey;
  }) {
    const query = yield* Schema.decodeUnknown(OperationsTaskQuery)(input ?? {}).pipe(
      Effect.mapError(
        (cause) =>
          new InfrastructureError({
            message: "Invalid operations task list query",
            cause,
          }),
      ),
    );

    const rows = yield* repository.listTaskRows({
      ...(query.mediaId === undefined ? {} : { mediaId: query.mediaId }),
      ...(query.excludeTaskKeys === undefined ? {} : { excludeTaskKeys: query.excludeTaskKeys }),
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
      ...(query.taskKey === undefined ? {} : { taskKey: query.taskKey }),
    });

    return yield* Effect.forEach(rows, (row) => toOperationsTask(row));
  });

  return {
    getTask,
    listTasks,
  } satisfies OperationsTaskReadServiceShape;
});

export class OperationsTaskWriteService extends Effect.Service<OperationsTaskWriteService>()(
  "@bakarr/api/OperationsTaskWriteService",
  { effect: makeOperationsTaskWriteService() },
) {}

export const OperationsTaskWriteServiceLive = OperationsTaskWriteService.Default;

export class OperationsTaskReadService extends Effect.Service<OperationsTaskReadService>()(
  "@bakarr/api/OperationsTaskReadService",
  { effect: makeOperationsTaskReadService() },
) {}

export const OperationsTaskReadServiceLive = OperationsTaskReadService.Default;

export const decodeOperationsTaskQuery = Effect.fn(
  "OperationsTaskService.decodeOperationsTaskQuery",
)(function* (input: {
  readonly media_id?: number | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  readonly task_key?: string | undefined;
}) {
  const taskKeyOption = Option.fromNullable(input.task_key);

  const decodedTaskKey = Option.isNone(taskKeyOption)
    ? Option.none<OperationsTaskKey>()
    : Option.some(
        yield* Schema.decodeUnknown(OperationTaskKeySchema)(taskKeyOption.value).pipe(
          Effect.mapError(
            (cause) =>
              new InfrastructureError({
                message: "Invalid operations task key",
                cause,
              }),
          ),
        ),
      );

  return {
    ...(input.media_id === undefined ? {} : { mediaId: input.media_id }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.offset === undefined ? {} : { offset: input.offset }),
    ...(Option.isSome(decodedTaskKey) ? { taskKey: decodedTaskKey.value } : {}),
  } as const;
});
