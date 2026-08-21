import { assert, describe, it } from "@effect/vitest";
import { Option } from "effect";

import {
  buildClaimToken,
  isClaimToken,
  isStaleClaimToken,
  parseClaimTimestamp,
  STALE_CLAIM_THRESHOLD_MS,
} from "@/features/operations/download/download-claim-token.ts";

describe("download claim tokens", () => {
  it("round-trips timestamp and uuid through the token", () => {
    const token = buildClaimToken("2026-01-01T00:00:00.000Z", "abc-123");

    assert.deepStrictEqual(token, "claim:2026-01-01T00:00:00.000Z:abc-123");
    assert.deepStrictEqual(isClaimToken(token), true);
    assert.deepStrictEqual(parseClaimTimestamp(token), Option.some("2026-01-01T00:00:00.000Z"));
  });

  it("treats plain reconciled timestamps as non-claims", () => {
    assert.deepStrictEqual(isClaimToken("2026-01-01T00:00:00.000Z"), false);
    assert.deepStrictEqual(isClaimToken(null), false);
    assert.deepStrictEqual(isClaimToken(undefined), false);
    assert.deepStrictEqual(parseClaimTimestamp("2026-01-01T00:00:00.000Z"), Option.none());
  });

  it("flags fresh claims as not stale", () => {
    const token = buildClaimToken("2026-01-01T00:00:00.000Z", "abc-123");
    const fiveMinutesLater = "2026-01-01T00:05:00.000Z";

    assert.deepStrictEqual(isStaleClaimToken(token, fiveMinutesLater), false);
  });

  it("flags claims past the threshold as stale", () => {
    const token = buildClaimToken("2026-01-01T00:00:00.000Z", "abc-123");
    const justPastThreshold = new Date(
      Date.parse("2026-01-01T00:00:00.000Z") + STALE_CLAIM_THRESHOLD_MS + 1,
    ).toISOString();

    assert.deepStrictEqual(isStaleClaimToken(token, justPastThreshold), true);
  });

  it("treats malformed claim tokens as stale so they get released", () => {
    assert.deepStrictEqual(
      isStaleClaimToken("claim:not-a-timestamp", "2026-01-01T00:00:00.000Z"),
      true,
    );
    assert.deepStrictEqual(isStaleClaimToken("claim:", "2026-01-01T00:00:00.000Z"), true);
  });

  it("never treats plain timestamps or null as stale claims", () => {
    assert.deepStrictEqual(
      isStaleClaimToken("2020-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
      false,
    );
    assert.deepStrictEqual(isStaleClaimToken(null, "2026-01-01T00:00:00.000Z"), false);
  });
});
