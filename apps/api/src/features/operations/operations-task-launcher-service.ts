import { Context, Effect, Layer } from "effect";

import type { AsyncOperationAccepted } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/lib/logging.ts";
import {
  type OperationsTaskKey,
  OperationsTaskService,
} from "@/features/operations/operations-task-service.ts";

export interface OperationsTaskLauncherServiceShape {
  readonly launch: <A>(input: {
    readonly animeId?: number;
    readonly queuedMessage: string;
    readonly runningMessage: string;
    readonly successMessage: (result: A) => string;
    readonly failureMessage: string;
    readonly taskKey: OperationsTaskKey;
    readonly operation: (taskId: number) => Effect.Effect<A, unknown, never>;
    readonly successProgress?: (result: A) => {
      readonly progressCurrent?: number;
      readonly progressTotal?: number;
    };
    readonly successPayload?: (result: A) => {
      readonly anime_id?: number;
      readonly failed?: number;
      readonly found?: number;
      readonly imported?: number;
      readonly total?: number;
    };
    readonly failurePayload?: (error: unknown) => {
      readonly anime_id?: number;
      readonly failed?: number;
      readonly found?: number;
      readonly imported?: number;
      readonly total?: number;
    };
  }) => Effect.Effect<AsyncOperationAccepted, DatabaseError | OperationsInfrastructureError, never>;
}

export class OperationsTaskLauncherService extends Context.Tag(
  "@bakarr/api/OperationsTaskLauncherService",
)<OperationsTaskLauncherService, OperationsTaskLauncherServiceShape>() {}

const makeOperationsTaskLauncherService = Effect.gen(function* () {
  const tasks = yield* OperationsTaskService;

  const launch = Effect.fn("OperationsTaskLauncherService.launch")(
    <A>(input: {
      readonly animeId?: number;
      readonly queuedMessage: string;
      readonly runningMessage: string;
      readonly successMessage: (result: A) => string;
      readonly failureMessage: string;
      readonly taskKey: OperationsTaskKey;
      readonly operation: (taskId: number) => Effect.Effect<A, unknown, never>;
      readonly successProgress?: (result: A) => {
        readonly progressCurrent?: number;
        readonly progressTotal?: number;
      };
      readonly successPayload?: (result: A) => {
        readonly anime_id?: number;
        readonly failed?: number;
        readonly found?: number;
        readonly imported?: number;
        readonly total?: number;
      };
      readonly failurePayload?: (error: unknown) => {
        readonly anime_id?: number;
        readonly failed?: number;
        readonly found?: number;
        readonly imported?: number;
        readonly total?: number;
      };
    }) =>
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
          Effect.catchAll((error) =>
            Effect.logError("Operations task failed").pipe(
              Effect.annotateLogs(
                compactLogAnnotations({
                  ...errorLogAnnotations(error),
                  animeId: input.animeId,
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
            ),
          ),
        );

        yield* runTask.pipe(Effect.forkDaemon);

        return accepted;
      }),
  );

  return OperationsTaskLauncherService.of({ launch });
});

export const OperationsTaskLauncherServiceLive = Layer.effect(
  OperationsTaskLauncherService,
  makeOperationsTaskLauncherService,
);
