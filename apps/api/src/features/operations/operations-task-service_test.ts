import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import {
  decodeOperationsTaskQuery,
  OperationsTaskService,
  OperationsTaskServiceLive,
} from "@/features/operations/operations-task-service.ts";
import { EventBusNoopLive } from "@/features/events/event-bus.ts";
import { ClockServiceLive } from "@/lib/clock.ts";
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
          const serviceLayer = OperationsTaskServiceLive.pipe(
            Layer.provide(Layer.mergeAll(databaseLayer, ClockServiceLive, EventBusNoopLive)),
          );

          const accepted = yield* Effect.flatMap(OperationsTaskService, (service) =>
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

          const task = yield* Effect.flatMap(OperationsTaskService, (service) =>
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
});
