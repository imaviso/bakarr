import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatSearchResultAge } from "./search-dialog-state";

describe("search dialog state helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats same-day search results as today", () => {
    expect(formatSearchResultAge("2026-05-08T01:00:00Z")).toBe("Today");
  });

  it("formats one-day-old search results as yesterday", () => {
    expect(formatSearchResultAge("2026-05-07T01:00:00Z")).toBe("Yesterday");
  });

  it("formats recent search results with day age", () => {
    expect(formatSearchResultAge("2026-04-28T12:00:00Z")).toBe("10d ago");
  });

  it("keeps invalid search result dates unchanged", () => {
    expect(formatSearchResultAge("not-a-date")).toBe("not-a-date");
  });
});
