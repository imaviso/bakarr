import { describe, expect, it } from "vitest";
import { formatLastRun, importModeLabel, preferredTitleLabel } from "./system-settings-schema";

describe("system settings schema helpers", () => {
  it("labels known import modes", () => {
    expect(importModeLabel("copy")).toBe("Copy");
    expect(importModeLabel("move")).toBe("Move");
  });

  it("defaults unknown preferred title values to romaji", () => {
    expect(preferredTitleLabel("english")).toBe("English");
    expect(preferredTitleLabel("native")).toBe("Native");
    expect(preferredTitleLabel("unexpected")).toBe("Romaji");
  });

  it("returns Never for missing last run values", () => {
    expect(formatLastRun(undefined)).toBe("Never");
    expect(formatLastRun(null)).toBe("Never");
    expect(formatLastRun("")).toBe("Never");
  });

  it("returns the original last run value when parsing fails", () => {
    expect(formatLastRun("not-a-date")).toBe("not-a-date");
  });
});
