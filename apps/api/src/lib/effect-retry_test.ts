import { assert, assertEquals } from "@std/assert";
import { Effect, Either } from "effect";

import { ExternalCallError, tryExternal } from "./effect-retry.ts";

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

Deno.test("tryExternal wraps timeout failures as ExternalCallError", async () => {
  const result = await Effect.runPromise(
    tryExternal("test.timeout", async (signal) => {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 11_000);

        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });

      return "never";
    })().pipe(Effect.either),
  );

  assert(Either.isLeft(result));
  assert(result.left instanceof ExternalCallError);
});
