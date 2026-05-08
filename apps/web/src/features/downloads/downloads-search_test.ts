import { describe, expect, it } from "vitest";
import { DOWNLOADS_EVENTS_SEARCH_KEYS } from "~/domain/download/events-search";
import { normalizeDownloadsSearch, parseDownloadsSearch, toDownloadsTab } from "./downloads-search";

describe("downloads search", () => {
  it("defaults invalid tabs instead of throwing an error page", () => {
    expect(parseDownloadsSearch({ tab: "wat" }).tab).toBe("queue");
    expect(toDownloadsTab("wat")).toBe("queue");
  });

  it("defaults invalid event cursor direction", () => {
    const parsed = parseDownloadsSearch({ [DOWNLOADS_EVENTS_SEARCH_KEYS.direction]: "sideways" });

    expect(parsed[DOWNLOADS_EVENTS_SEARCH_KEYS.direction]).toBe("next");
  });

  it("normalizes away default values but keeps meaningful filters", () => {
    expect(
      normalizeDownloadsSearch(
        parseDownloadsSearch({
          [DOWNLOADS_EVENTS_SEARCH_KEYS.animeId]: "42",
          [DOWNLOADS_EVENTS_SEARCH_KEYS.eventType]: "status_changed",
          tab: "events",
        }),
      ),
    ).toEqual({
      [DOWNLOADS_EVENTS_SEARCH_KEYS.animeId]: "42",
      [DOWNLOADS_EVENTS_SEARCH_KEYS.eventType]: "status_changed",
      tab: "events",
    });
  });
});
