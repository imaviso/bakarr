import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { tryExternal } from "./effect-retry.ts";

Deno.test("tryExternal retries transient failures", async () => {
  let attempts = 0;

  const result = await Effect.runPromise(
    tryExternal("test.retry", () => {
      attempts += 1;

      if (attempts < 3) {
        throw new Error("transient");
      }

      return Promise.resolve("ok");
    })(),
  );

  assertEquals(result, "ok");
  assertEquals(attempts, 3);
});
