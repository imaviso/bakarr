import { describe, expect, it } from "vitest";
import { LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS } from "~/domain/download/events-search";
import { logsSearchDefaults, parseLogsSearch } from "./logs-search";

describe("logs search", () => {
  it("defaults invalid download event cursor direction", () => {
    const parsed = parseLogsSearch({ [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.direction]: "sideways" });

    expect(parsed["download_direction"]).toBe("next");
  });

  it("preserves log filters and event filters together", () => {
    expect(
      parseLogsSearch({
        [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.mediaId]: "42",
        [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.eventType]: "grabbed",
        endDate: "2026-02-01",
        level: "error",
        startDate: "2026-01-01",
      }),
    ).toMatchObject({
      [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.mediaId]: "42",
      [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.eventType]: "grabbed",
      endDate: "2026-02-01",
      level: "error",
      startDate: "2026-01-01",
    });
  });

  it("uses stable defaults when search is empty", () => {
    expect(parseLogsSearch({})).toEqual(logsSearchDefaults);
  });
});
