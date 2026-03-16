import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { DatabaseError } from "../../db/database.ts";
import { runTestEffectExit } from "../../test/effect-test.ts";
import { makeDefaultConfig } from "./defaults.ts";
import {
  persistAndActivateConfig,
  type PersistedSystemConfigState,
} from "./config-activation.ts";

Deno.test("config activation keeps persisted state when activation succeeds", async () => {
  const persisted: PersistedSystemConfigState[] = [];
  const nextConfig: Config = {
    ...makeDefaultConfig("./test.sqlite"),
    profiles: [],
  };
  const previousState = state("previous");
  const nextState = state("next");

  const exit = await runTestEffectExit(
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
});

Deno.test("config activation rolls persisted state back when activation fails", async () => {
  const persisted: PersistedSystemConfigState[] = [];
  const nextConfig: Config = {
    ...makeDefaultConfig("./test.sqlite"),
    profiles: [],
  };
  const previousState = state("previous");
  const nextState = state("next");
  const activationError = new DatabaseError({
    cause: new Error("reload failed"),
    message: "reload failed",
  });

  const exit = await runTestEffectExit(
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
});

function state(seed: string): PersistedSystemConfigState {
  return {
    coreRow: {
      data: seed,
      id: 1,
      updatedAt: seed === "previous"
        ? "2024-01-01T00:00:00.000Z"
        : "2024-01-02T00:00:00.000Z",
    },
    profileRows: [],
  };
}
