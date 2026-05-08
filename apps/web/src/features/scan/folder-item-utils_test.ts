import { describe, expect, it } from "vitest";
import { normalizeApiErrorMessage } from "./folder-item-utils";

describe("normalizeApiErrorMessage", () => {
  it("trims decoded JSON error text", () => {
    expect(normalizeApiErrorMessage('{"error":"  AniList unavailable  "}')).toBe(
      "AniList unavailable",
    );
  });

  it("uses trimmed decoded message when error is blank", () => {
    expect(normalizeApiErrorMessage('{"error":"   ","message":"  Try again later  "}')).toBe(
      "Try again later",
    );
  });

  it("trims plain text errors", () => {
    expect(normalizeApiErrorMessage("  Network unavailable  ")).toBe("Network unavailable");
  });
});
