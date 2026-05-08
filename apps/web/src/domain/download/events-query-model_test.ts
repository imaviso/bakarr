import { describe, expect, it } from "vitest";
import { buildDownloadEventsFilterInput, parseOptionalPositiveInt } from "./events-query-model";

describe("parseOptionalPositiveInt", () => {
  it("accepts plain positive integer strings", () => {
    expect(parseOptionalPositiveInt("42")).toBe(42);
  });

  it("rejects non-decimal numeric spellings for ids", () => {
    expect(parseOptionalPositiveInt("1e3")).toBeUndefined();
    expect(parseOptionalPositiveInt("+42")).toBeUndefined();
    expect(parseOptionalPositiveInt("1.0")).toBeUndefined();
  });

  it("rejects ids beyond the safe integer range", () => {
    expect(parseOptionalPositiveInt("9007199254740992")).toBeUndefined();
  });
});

describe("buildDownloadEventsFilterInput", () => {
  it("omits invalid numeric filters rather than sending coerced ids", () => {
    expect(
      buildDownloadEventsFilterInput({
        animeId: "1e3",
        cursor: "",
        direction: "next",
        downloadId: "+42",
        endDate: "",
        eventType: "all",
        startDate: "",
        status: "",
      }),
    ).toEqual({ direction: "next", limit: 24 });
  });

  it("trims text filters and omits whitespace-only values", () => {
    expect(
      buildDownloadEventsFilterInput({
        animeId: "",
        cursor: "  cursor-1  ",
        direction: "prev",
        downloadId: "",
        endDate: "   ",
        eventType: "  grabbed  ",
        startDate: "  2026-03-01  ",
        status: "   ",
      }),
    ).toEqual({
      cursor: "cursor-1",
      direction: "prev",
      eventType: "grabbed",
      limit: 24,
      startDate: "2026-03-01",
    });
  });
});
