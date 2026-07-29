import { assert, it } from "@effect/vitest";
import { Schema } from "effect";

import { formatValidationErrorMessage } from "@/http/shared/route-validation.ts";

it("formatValidationErrorMessage includes parse error paths", () => {
  const schema = Schema.Struct({
    count: Schema.Number,
  });
  const error = Schema.decodeUnknownResult(schema)({ count: "bad" });

  assert.deepStrictEqual(error._tag, "Failure");
  if (error._tag === "Failure") {
    const message = formatValidationErrorMessage("Invalid request", error.failure);

    assert.match(message, /^Invalid request: /);
    assert.match(message, /count:/);
  }
});

it("formatValidationErrorMessage includes ordinary error messages", () => {
  assert.deepStrictEqual(
    formatValidationErrorMessage("Invalid request", new Error("boom")),
    "Invalid request: boom",
  );
});

it("formatValidationErrorMessage falls back to the base message for unknown errors", () => {
  assert.deepStrictEqual(formatValidationErrorMessage("Invalid request", 123), "Invalid request");
});
