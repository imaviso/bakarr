import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDate, formatDateTime, formatTime, formatUiTimestamp, isAired } from "./date-time";

describe("date time helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats missing and invalid air dates as unaired", () => {
    expect(isAired()).toBe(false);
    expect(isAired("not-a-date")).toBe(false);
  });

  it("detects past and future air dates against current time", () => {
    expect(isAired("2026-05-07")).toBe(true);
    expect(isAired("2026-05-09")).toBe(false);
  });

  it("keeps invalid formatted date values unchanged", () => {
    expect(formatUiTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatTime("not-a-date")).toBe("not-a-date");
  });
});
