import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import { Database } from "@/db/database.ts";
import {
  decodeOperationsTaskQuery,
  decodeTaskPayload,
  encodeTaskPayload,
  OperationsTaskReadService,
  OperationsTaskReadServiceLive,
  OperationsTaskWriteService,
  OperationsTaskWriteServiceLive,
} from "@/features/operations/tasks/operations-task-service.ts";
import { EventBusNoopLive } from "@/features/events/event-bus.ts";
import { ClockServiceLive } from "@/infra/clock.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import * as schema from "@/db/schema.ts";

describe("OperationsTaskService", () => {
  it.scoped("creates and fetches tasks", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client) =>
        Effect.gen(function* () {
          const databaseLayer = Layer.succeed(Database, {
            client,
            db,
          });
          const serviceLayer = Layer.mergeAll(
            OperationsTaskReadServiceLive,
            OperationsTaskWriteServiceLive,
          ).pipe(Layer.provide(Layer.mergeAll(databaseLayer, ClockServiceLive, EventBusNoopLive)));

          const accepted = yield* Effect.flatMap(OperationsTaskWriteService, (service) =>
            service.createTask({
              animeId: 11,
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
          assert.deepStrictEqual(task.anime_id, 11);
        }),
      schema,
    }),
  );

  it.effect("decodes valid task query", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeOperationsTaskQuery({
        anime_id: 3,
        task_key: "anime_scan_folder",
      });

      assert.deepStrictEqual(decoded, {
        animeId: 3,
        taskKey: "anime_scan_folder",
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
