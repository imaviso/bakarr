import { assertEquals, it } from "@/test/vitest.ts";
import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import {
  persistAndActivateConfig,
  type PersistedSystemConfigState,
} from "@/features/system/config-activation.ts";

it.effect("config activation keeps persisted state when activation succeeds", () =>
  Effect.gen(function* () {
    const persisted: PersistedSystemConfigState[] = [];
    const nextConfig = makeTestConfig("./test.sqlite");
    const previousState = state("previous");
    const nextState = state("next");

    const exit = yield* Effect.exit(
      persistAndActivateConfig({
        activateConfig: () => Effect.void,
        nextConfig,
        nextState,
        persistState: (value) =>
          Effect.sync(() => {
            persisted.push(value);
          }),
        previousState,
        recordEvent: () => Effect.void,
      }),
    );

    assertEquals(exit._tag, "Success");
    assertEquals(persisted, [nextState]);
  }),
);

it.effect("config activation rolls persisted state back when activation fails", () =>
  Effect.gen(function* () {
    const persisted: PersistedSystemConfigState[] = [];
    const nextConfig = makeTestConfig("./test.sqlite");
    const previousState = state("previous");
    const nextState = state("next");
    const activationError = new DatabaseError({
      cause: new Error("reload failed"),
      message: "reload failed",
    });

    const exit = yield* Effect.exit(
      persistAndActivateConfig({
        activateConfig: () => Effect.fail(activationError),
        nextConfig,
        nextState,
        persistState: (value) =>
          Effect.sync(() => {
            persisted.push(value);
          }),
        previousState,
        recordEvent: () => Effect.void,
      }),
    );

    assertEquals(exit._tag, "Failure");
    assertEquals(persisted, [nextState, previousState]);
  }),
);

function state(seed: string): PersistedSystemConfigState {
  return {
    coreRow: {
      data: seed,
      id: 1,
      updatedAt: seed === "previous" ? "2024-01-01T00:00:00.000Z" : "2024-01-02T00:00:00.000Z",
    },
    profileRows: [],
  };
}
