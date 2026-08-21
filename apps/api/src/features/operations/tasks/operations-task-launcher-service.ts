// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Cause, Effect, Queue, Ref } from "effect";

import {
  brandOperationTaskId,
  type AsyncOperationAccepted,
  type OperationTaskPayload,
} from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/infra/logging.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import {
  type OperationsTaskKey,
  OperationsTaskWriteService,
} from "@/features/operations/tasks/operations-task-service.ts";

export interface OperationsTaskLaunchInput<A> {
  readonly mediaId?: number;
  readonly queuedMessage: string;
  readonly runningMessage: string;
  readonly successMessage: (result: A) => string;
  readonly failureMessage: string;
  readonly taskKey: OperationsTaskKey;
  readonly operation: (taskId: number) => Effect.Effect<A, unknown>;
  readonly successProgress?: (result: A) => {
    readonly progressCurrent?: number;
    readonly progressTotal?: number;
  };
  readonly successPayload?: (result: A) => OperationTaskPayload;
  readonly failurePayload?: (error: unknown) => OperationTaskPayload;
}

export interface OperationsTaskLauncherServiceShape {
  readonly launch: <A>(
    input: OperationsTaskLaunchInput<A>,
  ) => Effect.Effect<AsyncOperationAccepted, DatabaseError | InfrastructureError>;
}

const OPERATIONS_TASK_WORKER_CONCURRENCY = 4;

const makeOperationsTaskLauncherService = Effect.fn("OperationsTaskLauncherService.make")(
  function* () {
    const tasks = yield* OperationsTaskWriteService;
    const taskQueue = yield* Effect.acquireRelease(
      Queue.unbounded<Effect.Effect<void, DatabaseError | InfrastructureError>>(),
      Queue.shutdown,
    );
    // Coalescing: taskKey → id of the pending/running task. A launch for a
    // key that already has an active task is folded into it (single-user
    // app; CONTEXT.md "Supports coalescing concurrent requests").
    const activeTaskIds = yield* Ref.make(new Map<OperationsTaskKey, number>());

    const runQueuedTask = Effect.fn("OperationsTaskLauncherService.runQueuedTask")(
      (taskEffect: Effect.Effect<void, DatabaseError | InfrastructureError>) =>
        taskEffect.pipe(
          Effect.catchAllCause((cause) =>
            Effect.logError("Operations task launcher worker failed").pipe(
              Effect.annotateLogs({
                cause: Cause.pretty(cause),
                component: "operations",
                event: "operations.task.launcher.worker.failed",
              }),
            ),
          ),
        ),
    );

    const workerLoop = Queue.take(taskQueue).pipe(
      Effect.flatMap((task) => runQueuedTask(task)),
      Effect.forever,
    );

    yield* Effect.forEach(
      Array.from({ length: OPERATIONS_TASK_WORKER_CONCURRENCY }),
      () => workerLoop.pipe(Effect.forkScoped),
      { discard: true },
    );

    const launch = Effect.fn("OperationsTaskLauncherService.launch")(
      <A>(input: OperationsTaskLaunchInput<A>) =>
        Effect.gen(function* () {
          const existingTaskId = (yield* Ref.get(activeTaskIds)).get(input.taskKey);

          if (existingTaskId !== undefined) {
            yield* Effect.logDebug("Coalesced operations task launch into active task").pipe(
              Effect.annotateLogs({
                activeTaskId: existingTaskId,
                taskKey: input.taskKey,
              }),
            );

            const now = yield* currentNowIso();
            const accepted: AsyncOperationAccepted = {
              accepted_at: now,
              message: input.queuedMessage,
              status: "queued",
              task_id: brandOperationTaskId(existingTaskId),
              task_key: input.taskKey,
            };
            return accepted;
          }

          const accepted = yield* tasks.createTask({
            ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
            message: input.queuedMessage,
            taskKey: input.taskKey,
          });
          const taskId = accepted.task_id;
          yield* Ref.update(activeTaskIds, (map) => new Map(map).set(input.taskKey, taskId));

          const runTask = Effect.gen(function* () {
            yield* tasks.markRunningTask({
              message: input.runningMessage,
              taskId,
            });

            const result = yield* input.operation(taskId);
            const progress = input.successProgress ? input.successProgress(result) : undefined;

            yield* tasks.completeSucceededTask({
              message: input.successMessage(result),
              ...(input.successPayload === undefined
                ? {}
                : { payload: input.successPayload(result) }),
              ...(progress?.progressCurrent === undefined
                ? {}
                : { progressCurrent: progress.progressCurrent }),
              ...(progress?.progressTotal === undefined
                ? {}
                : { progressTotal: progress.progressTotal }),
              taskId,
            });
          }).pipe(
            Effect.ensuring(
              Ref.update(activeTaskIds, (map) => {
                const next = new Map(map);
                next.delete(input.taskKey);
                return next;
              }),
            ),
            Effect.catchAllCause((cause) => {
              const error = Cause.squash(cause);

              return Effect.logError("Operations task failed").pipe(
                Effect.annotateLogs(
                  compactLogAnnotations({
                    ...errorLogAnnotations(error),
                    mediaId: input.mediaId,
                    cause: Cause.pretty(cause),
                    component: "operations",
                    event: "operations.task.failed",
                    taskId,
                    taskKey: input.taskKey,
                  }),
                ),
                Effect.zipRight(
                  tasks.completeFailedTask({
                    error,
                    message: input.failureMessage,
                    ...(input.failurePayload === undefined
                      ? {}
                      : { payload: input.failurePayload(error) }),
                    taskId,
                  }),
                ),
              );
            }),
          );

          yield* Queue.offer(taskQueue, runTask);

          return accepted;
        }),
    );

    return { launch } satisfies OperationsTaskLauncherServiceShape;
  },
);

export class OperationsTaskLauncherService extends Effect.Service<OperationsTaskLauncherService>()(
  "@bakarr/api/OperationsTaskLauncherService",
  {
    scoped: makeOperationsTaskLauncherService(),
    dependencies: [OperationsTaskWriteService.Default],
  },
) {}

export const OperationsTaskLauncherServiceLive = OperationsTaskLauncherService.Default;
