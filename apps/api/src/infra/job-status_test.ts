import { assert, it } from "@effect/vitest";
import { Cause } from "effect";

import { formatJobFailureMessage } from "@/infra/job-status.ts";

it("formatJobFailureMessage formats Effect causes", () => {
  assert.match(formatJobFailureMessage(Cause.fail("boom")), /boom/);
});

it("formatJobFailureMessage formats tagged errors and regular errors", () => {
  assert.deepStrictEqual(
    formatJobFailureMessage({ _tag: "ConfigError", message: "bad config" }),
    "ConfigError: bad config",
  );
  assert.deepStrictEqual(formatJobFailureMessage(new TypeError("bad type")), "TypeError: bad type");
});

it("formatJobFailureMessage stringifies unknown causes", () => {
  assert.deepStrictEqual(formatJobFailureMessage(42), "42");
});
