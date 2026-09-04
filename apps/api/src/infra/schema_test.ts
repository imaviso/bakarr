import { Schema } from "effect";
import { assert, it } from "@effect/vitest";

import {
  PositiveIntSchema,
  PositiveIntFromStringSchema,
  NonNegativeIntFromStringSchema,
  MediaIdSchema,
  DownloadIdSchema,
  UnitNumberSchema,
} from "@/infra/schema.ts";

it("PositiveIntSchema rejects non-positive values", () => {
  assert.deepStrictEqual(Schema.decodeUnknownResult(PositiveIntSchema)(0)._tag, "Failure");
  assert.deepStrictEqual(Schema.decodeUnknownResult(PositiveIntSchema)(-1)._tag, "Failure");
  assert.deepStrictEqual(Schema.decodeUnknownResult(PositiveIntSchema)(1.5)._tag, "Failure");
});

it("PositiveIntSchema accepts positive integers", () => {
  const result = Schema.decodeUnknownResult(PositiveIntSchema)(1);
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") assert.deepStrictEqual(result.success, 1);
});

it("PositiveIntFromStringSchema parses string numbers and rejects invalid", () => {
  const r1 = Schema.decodeUnknownResult(PositiveIntFromStringSchema)("7");
  assert.ok(r1._tag === "Success");
  if (r1._tag === "Success") assert.deepStrictEqual(r1.success, 7);

  assert.deepStrictEqual(
    Schema.decodeUnknownResult(PositiveIntFromStringSchema)("0")._tag,
    "Failure",
  );
  assert.deepStrictEqual(
    Schema.decodeUnknownResult(PositiveIntFromStringSchema)("abc")._tag,
    "Failure",
  );
});

it("NonNegativeIntFromStringSchema accepts zero", () => {
  const result = Schema.decodeUnknownResult(NonNegativeIntFromStringSchema)("0");
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") assert.deepStrictEqual(result.success, 0);
  assert.deepStrictEqual(
    Schema.decodeUnknownResult(NonNegativeIntFromStringSchema)("-1")._tag,
    "Failure",
  );
});

it("MediaIdSchema brands positive ints", () => {
  const result = Schema.decodeUnknownResult(MediaIdSchema)(5);
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") assert.deepStrictEqual(result.success, 5);
});

it("DownloadIdSchema brands positive ints", () => {
  const result = Schema.decodeUnknownResult(DownloadIdSchema)(10);
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") assert.deepStrictEqual(result.success, 10);
});

it("UnitNumberSchema brands positive ints", () => {
  const result = Schema.decodeUnknownResult(UnitNumberSchema)(3);
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") assert.deepStrictEqual(result.success, 3);
});
