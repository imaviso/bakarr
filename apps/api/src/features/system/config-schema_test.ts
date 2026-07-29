import { assert, it } from "@effect/vitest";
import { Schema } from "effect";

import { NumberListSchema, ReleaseProfileRulesSchema } from "@/features/system/config-schema.ts";

it("NumberListSchema deduplicates and sorts values", () => {
  const result = Schema.decodeUnknownResult(NumberListSchema)([3, 1, 3, 2]);
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") {
    assert.deepStrictEqual(result.success, [1, 2, 3]);
  }
});

it("NumberListSchema rejects non-positive values", () => {
  const result = Schema.decodeUnknownResult(NumberListSchema)([0, 1]);
  assert.deepStrictEqual(result._tag, "Failure");
});

it("NumberListSchema accepts empty array", () => {
  const result = Schema.decodeUnknownResult(NumberListSchema)([]);
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") {
    assert.deepStrictEqual(result.success, []);
  }
});

it("ReleaseProfileRulesSchema accepts valid rule array", () => {
  const result = Schema.decodeUnknownResult(ReleaseProfileRulesSchema)([
    { term: "HEVC", score: 5, rule_type: "preferred" },
    { term: "x265", score: 3, rule_type: "preferred" },
  ]);
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") {
    assert.deepStrictEqual(result.success.length, 2);
  }
});

it("ReleaseProfileRulesSchema rejects invalid rules", () => {
  const result = Schema.decodeUnknownResult(ReleaseProfileRulesSchema)([
    { term: "HEVC", score: "bad", rule_type: "preferred" },
  ]);
  assert.deepStrictEqual(result._tag, "Failure");
});
