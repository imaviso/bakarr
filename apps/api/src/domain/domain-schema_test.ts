import { Schema } from "effect";
import { assert, it } from "@effect/vitest";

import {
  PositiveIntSchema,
  PositiveIntFromStringSchema,
  NonNegativeIntFromStringSchema,
  AnimeIdSchema,
  DownloadIdSchema,
  EpisodeNumberSchema,
} from "@/domain/domain-schema.ts";

it("PositiveIntSchema rejects non-positive values", () => {
  assert.deepStrictEqual(Schema.decodeUnknownEither(PositiveIntSchema)(0)._tag, "Left");
  assert.deepStrictEqual(Schema.decodeUnknownEither(PositiveIntSchema)(-1)._tag, "Left");
  assert.deepStrictEqual(Schema.decodeUnknownEither(PositiveIntSchema)(1.5)._tag, "Left");
});

it("PositiveIntSchema accepts positive integers", () => {
  const result = Schema.decodeUnknownEither(PositiveIntSchema)(1);
  assert.ok(result._tag === "Right");
  if (result._tag === "Right") assert.deepStrictEqual(result.right, 1);
});

it("PositiveIntFromStringSchema parses string numbers and rejects invalid", () => {
  const r1 = Schema.decodeUnknownEither(PositiveIntFromStringSchema)("7");
  assert.ok(r1._tag === "Right");
  if (r1._tag === "Right") assert.deepStrictEqual(r1.right, 7);

  assert.deepStrictEqual(Schema.decodeUnknownEither(PositiveIntFromStringSchema)("0")._tag, "Left");
  assert.deepStrictEqual(
    Schema.decodeUnknownEither(PositiveIntFromStringSchema)("abc")._tag,
    "Left",
  );
});

it("NonNegativeIntFromStringSchema accepts zero", () => {
  const result = Schema.decodeUnknownEither(NonNegativeIntFromStringSchema)("0");
  assert.ok(result._tag === "Right");
  if (result._tag === "Right") assert.deepStrictEqual(result.right, 0);
  assert.deepStrictEqual(
    Schema.decodeUnknownEither(NonNegativeIntFromStringSchema)("-1")._tag,
    "Left",
  );
});

it("AnimeIdSchema brands positive ints", () => {
  const result = Schema.decodeUnknownEither(AnimeIdSchema)(5);
  assert.ok(result._tag === "Right");
  if (result._tag === "Right") assert.deepStrictEqual(result.right, 5);
});

it("DownloadIdSchema brands positive ints", () => {
  const result = Schema.decodeUnknownEither(DownloadIdSchema)(10);
  assert.ok(result._tag === "Right");
  if (result._tag === "Right") assert.deepStrictEqual(result.right, 10);
});

it("EpisodeNumberSchema brands positive ints", () => {
  const result = Schema.decodeUnknownEither(EpisodeNumberSchema)(3);
  assert.ok(result._tag === "Right");
  if (result._tag === "Right") assert.deepStrictEqual(result.right, 3);
});
