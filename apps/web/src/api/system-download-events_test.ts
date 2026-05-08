import { describe, expect, it } from "vitest";
import { getDownloadEventsExportUrl } from "./system-download-events";

describe("system download events API helpers", () => {
  it("builds export URLs with all meaningful filters", () => {
    const url = getDownloadEventsExportUrl(
      {
        animeId: 0,
        downloadId: 12,
        endDate: "2026-02-01 23:59:59",
        eventType: "status_changed",
        limit: 500,
        order: "asc",
        startDate: "2026-01-01 00:00:00",
        status: "completed",
      },
      "csv",
    );

    expect(url).toBe(
      "/api/downloads/events/export?anime_id=0&download_id=12&event_type=status_changed&status=completed&start_date=2026-01-01+00%3A00%3A00&end_date=2026-02-01+23%3A59%3A59&limit=500&order=asc&format=csv",
    );
  });

  it("omits empty optional filters but keeps explicit numeric values", () => {
    const url = getDownloadEventsExportUrl({ animeId: 0, eventType: "", limit: 0, status: "" });

    expect(url).toBe("/api/downloads/events/export?anime_id=0&limit=0&format=json");
  });

  it("defaults export format to json", () => {
    expect(getDownloadEventsExportUrl({})).toBe("/api/downloads/events/export?format=json");
  });
});
