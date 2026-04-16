import { Cause, Context, Effect, Layer, Queue } from "effect";

import type { AsyncOperationAccepted, OperationTaskPayload } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/lib/logging.ts";
import {
  type OperationsTaskKey,
  OperationsTaskService,
} from "@/features/operations/operations-task-service.ts";

export interface OperationsTaskLaunchInput<A> {
  readonly animeId?: number;
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
  ) => Effect.Effect<AsyncOperationAccepted, DatabaseError | OperationsInfrastructureError>;
}

export class OperationsTaskLauncherService extends Context.Tag(
  "@bakarr/api/OperationsTaskLauncherService",
)<OperationsTaskLauncherService, OperationsTaskLauncherServiceShape>() {}

const OPERATIONS_TASK_WORKER_CONCURRENCY = 4;

const makeOperationsTaskLauncherService = Effect.gen(function* () {
  const tasks = yield* OperationsTaskService;
  const taskQueue = yield* Effect.acquireRelease(
    Queue.unbounded<Effect.Effect<void, DatabaseError | OperationsInfrastructureError>>(),
    Queue.shutdown,
  );

  const runQueuedTask = Effect.fn("OperationsTaskLauncherService.runQueuedTask")(
    (taskEffect: Effect.Effect<void, DatabaseError | OperationsInfrastructureError>) =>
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

  const workerLoop = Queue.take(taskQueue).pipe(Effect.flatMap(runQueuedTask), Effect.forever);

  yield* Effect.forEach(
    Array.from({ length: OPERATIONS_TASK_WORKER_CONCURRENCY }),
    () => workerLoop.pipe(Effect.forkScoped),
    { discard: true },
  );

  const launch = Effect.fn("OperationsTaskLauncherService.launch")(
    <A>(input: OperationsTaskLaunchInput<A>) =>
      Effect.gen(function* () {
        const accepted = yield* tasks.createTask({
          ...(input.animeId === undefined ? {} : { animeId: input.animeId }),
          message: input.queuedMessage,
          taskKey: input.taskKey,
        });
        const taskId = accepted.task_id;

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
          Effect.catchAllCause((cause) => {
            const error = Cause.squash(cause);

            return Effect.logError("Operations task failed").pipe(
              Effect.annotateLogs(
                compactLogAnnotations({
                  ...errorLogAnnotations(error),
                  animeId: input.animeId,
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

  return OperationsTaskLauncherService.of({ launch });
});

export const OperationsTaskLauncherServiceLive = Layer.scoped(
  OperationsTaskLauncherService,
  makeOperationsTaskLauncherService,
);
