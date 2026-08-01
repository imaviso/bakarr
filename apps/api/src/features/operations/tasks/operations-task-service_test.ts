import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Schema } from "effect";

import { AppDrizzleDatabase } from "@/db/database.ts";
import {
  decodeOperationsTaskQuery,
  decodeTaskPayload,
  encodeTaskPayload,
  OperationsTaskReadService,
  OperationsTaskWriteService,
} from "@/features/operations/tasks/operations-task-service.ts";
import { EventBusNoopLive } from "@/features/events/event-bus.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import * as schema from "@/db/schema.ts";
import { OperationsTaskRepository } from "@/features/operations/repository/task-repository.ts";

describe("OperationsTaskService", () => {
  it.scoped("creates and fetches tasks", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const databaseLayer = Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db));
          const repositoryLayer = OperationsTaskRepository.DefaultWithoutDependencies.pipe(
            Layer.provide(databaseLayer),
          );
          const serviceLayer = Layer.mergeAll(
            OperationsTaskReadService.DefaultWithoutDependencies,
            OperationsTaskWriteService.DefaultWithoutDependencies,
          ).pipe(Layer.provide(Layer.mergeAll(repositoryLayer, EventBusNoopLive)));

          const accepted = yield* Effect.flatMap(OperationsTaskWriteService, (service) =>
            service.createTask({
              mediaId: 11,
              message: "Queued test import",
              taskKey: "library_import",
            }),
          ).pipe(Effect.provide(serviceLayer));

          assert.deepStrictEqual(accepted.task_key, "library_import");
          assert.deepStrictEqual(accepted.status, "queued");
          assert.deepStrictEqual(typeof accepted.task_id, "number");
          const taskId = accepted.task_id;

          if (taskId === undefined) {
            throw new Error("Expected task id");
          }

          const task = yield* Effect.flatMap(OperationsTaskReadService, (service) =>
            service.getTask(taskId),
          ).pipe(Effect.provide(serviceLayer));

          assert.deepStrictEqual(task.task_key, "library_import");
          assert.deepStrictEqual(task.status, "queued");
          assert.deepStrictEqual(task.media_id, 11);
        }),
      schema,
    }),
  );

  it.scoped("getTaskForTaskKey enforces task-key and media ownership", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const databaseLayer = Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db));
          const repositoryLayer = OperationsTaskRepository.DefaultWithoutDependencies.pipe(
            Layer.provide(databaseLayer),
          );
          const serviceLayer = Layer.mergeAll(
            OperationsTaskReadService.DefaultWithoutDependencies,
            OperationsTaskWriteService.DefaultWithoutDependencies,
          ).pipe(Layer.provide(Layer.mergeAll(repositoryLayer, EventBusNoopLive)));

          const writeTask = (input: {
            mediaId?: number;
            taskKey: "library_import" | "media_scan_folder";
          }) =>
            Effect.flatMap(OperationsTaskWriteService, (service) =>
              service.createTask({
                ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
                message: "Queued test task",
                taskKey: input.taskKey,
              }),
            ).pipe(Effect.provide(serviceLayer));

          const scanTask = yield* writeTask({ mediaId: 7, taskKey: "media_scan_folder" });
          const globalTask = yield* writeTask({ taskKey: "library_import" });

          const getOwned = (input: {
            mediaId?: number;
            taskId: number;
            taskKey: "library_import" | "media_scan_folder";
          }) =>
            Effect.flatMap(OperationsTaskReadService, (service) =>
              service.getTaskForTaskKey(input),
            ).pipe(Effect.provide(serviceLayer));

          const owned = yield* getOwned({
            mediaId: 7,
            taskId: scanTask.task_id,
            taskKey: "media_scan_folder",
          });
          assert.deepStrictEqual(Option.isSome(owned), true);

          const wrongKey = yield* getOwned({
            mediaId: 7,
            taskId: scanTask.task_id,
            taskKey: "library_import",
          });
          assert.deepStrictEqual(Option.isNone(wrongKey), true);

          const wrongMedia = yield* getOwned({
            mediaId: 8,
            taskId: scanTask.task_id,
            taskKey: "media_scan_folder",
          });
          assert.deepStrictEqual(Option.isNone(wrongMedia), true);

          const globalOwned = yield* getOwned({
            mediaId: 8,
            taskId: globalTask.task_id,
            taskKey: "library_import",
          });
          assert.deepStrictEqual(Option.isSome(globalOwned), true);
        }),
      schema,
    }),
  );

  it.effect("decodes valid task query", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeOperationsTaskQuery({
        media_id: 3,
        task_key: "media_scan_folder",
      });

      assert.deepStrictEqual(decoded, {
        mediaId: 3,
        taskKey: "media_scan_folder",
      });
    }),
  );

  it.effect("decodeTaskPayload returns null for null input", () =>
    Effect.gen(function* () {
      const result = yield* decodeTaskPayload(null);
      assert.strictEqual(result, null);
    }),
  );

  it.effect("decodeTaskPayload returns null for undefined input", () =>
    Effect.gen(function* () {
      const result = yield* decodeTaskPayload(undefined);
      assert.strictEqual(result, null);
    }),
  );

  it.effect("decodeTaskPayload returns null for empty string", () =>
    Effect.gen(function* () {
      const result = yield* decodeTaskPayload("");
      assert.strictEqual(result, null);
    }),
  );

  it.effect("decodeTaskPayload returns parsed payload for valid JSON", () =>
    Effect.gen(function* () {
      const result = yield* decodeTaskPayload('{"imported":5,"failed":0}');
      assert.deepStrictEqual(result, { imported: 5, failed: 0 });
    }),
  );

  it.effect("encodeTaskPayload returns empty string for undefined input", () =>
    Effect.gen(function* () {
      const result = yield* encodeTaskPayload(undefined);
      assert.strictEqual(result, "");
    }),
  );

  it.effect("encodeTaskPayload returns encoded JSON for valid payload", () =>
    Effect.gen(function* () {
      const payload = { imported: 5, failed: 0 };
      const result = yield* encodeTaskPayload(payload);
      const parsed = yield* Schema.decodeUnknown(
        Schema.parseJson(Schema.Struct({ imported: Schema.Number, failed: Schema.Number })),
      )(result);
      assert.deepStrictEqual(parsed, payload);
    }),
  );
});
