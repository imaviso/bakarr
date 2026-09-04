import { assert, it } from "@effect/vitest";

import { parseSizeLabelToBytes } from "@/features/operations/search/release-ranking-size.ts";
import { Option, Result } from "effect";

function unwrapSize(value: string | null | undefined) {
  const parsed = parseSizeLabelToBytes(value);
  assert.deepStrictEqual(Result.isSuccess(parsed), true);
  if (Result.isFailure(parsed)) {
    throw parsed.failure;
  }
  return Option.getOrUndefined(parsed.success);
}

it("parseSizeLabelToBytes parses binary units", () => {
  assert.deepStrictEqual(unwrapSize("1 B"), 1);
  assert.deepStrictEqual(unwrapSize("1 KiB"), 1024);
  assert.deepStrictEqual(unwrapSize("1.5 MiB"), 1_572_864);
  assert.deepStrictEqual(unwrapSize("2 GB"), 2 * 1024 ** 3);
  assert.deepStrictEqual(unwrapSize("0.5 TiB"), 512 * 1024 ** 3);
});

it("parseSizeLabelToBytes treats empty labels as none", () => {
  assert.deepStrictEqual(unwrapSize(undefined), undefined);
  assert.deepStrictEqual(unwrapSize(null), undefined);
  assert.deepStrictEqual(unwrapSize("   "), undefined);
});

it("parseSizeLabelToBytes rejects invalid labels", () => {
  assert.deepStrictEqual(Result.isFailure(parseSizeLabelToBytes("large")), true);
  assert.deepStrictEqual(Result.isFailure(parseSizeLabelToBytes("1 XB")), true);
  assert.deepStrictEqual(Result.isFailure(parseSizeLabelToBytes("-1 GB")), true);
  assert.deepStrictEqual(Result.isFailure(parseSizeLabelToBytes("abc 1 GB")), true);
  assert.deepStrictEqual(Result.isFailure(parseSizeLabelToBytes("1.2.3 GB")), true);
});
