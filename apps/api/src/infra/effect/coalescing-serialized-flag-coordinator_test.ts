import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import { makeSerializedFlagCoordinator } from "@/infra/effect/coalescing-serialized-flag-coordinator.ts";

it.effect("SerializedFlagCoordinator tryStartAndMarkRunning returns true first time", () =>
  Effect.gen(function* () {
    const coordinator = yield* makeSerializedFlagCoordinator();
    const started = yield* coordinator.tryStartAndMarkRunning;
    assert.deepStrictEqual(started, true);
  }),
);

it.effect("SerializedFlagCoordinator tryStartAndMarkRunning returns false while running", () =>
  Effect.gen(function* () {
    const coordinator = yield* makeSerializedFlagCoordinator();
    yield* coordinator.tryStartAndMarkRunning;
    const started = yield* coordinator.tryStartAndMarkRunning;
    assert.deepStrictEqual(started, false);
  }),
);

it.effect("SerializedFlagCoordinator finish allows re-start", () =>
  Effect.gen(function* () {
    const coordinator = yield* makeSerializedFlagCoordinator();
    yield* coordinator.tryStartAndMarkRunning;
    yield* coordinator.finish;
    const restarted = yield* coordinator.tryStartAndMarkRunning;
    assert.deepStrictEqual(restarted, true);
  }),
);

it.effect("SerializedFlagCoordinator finish without start is no-op", () =>
  Effect.gen(function* () {
    const coordinator = yield* makeSerializedFlagCoordinator();
    yield* coordinator.finish;
    const started = yield* coordinator.tryStartAndMarkRunning;
    assert.deepStrictEqual(started, true);
  }),
);
