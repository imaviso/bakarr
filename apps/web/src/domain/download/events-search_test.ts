import { describe, expect, it } from "vitest";
import {
  createDownloadsRouteSearch,
  createLogsRouteSearch,
  DOWNLOADS_EVENTS_SEARCH_KEYS,
  LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
} from "./events-search";

describe("download events route search builders", () => {
  it("trims anime id when creating downloads route search", () => {
    expect(createDownloadsRouteSearch({ mediaId: "  42  " })).toMatchObject({
      [DOWNLOADS_EVENTS_SEARCH_KEYS.mediaId]: "42",
    });
  });

  it("does not preserve whitespace-only anime ids for downloads", () => {
    expect(createDownloadsRouteSearch({ mediaId: "   " })).toMatchObject({
      [DOWNLOADS_EVENTS_SEARCH_KEYS.mediaId]: "",
    });
  });

  it("trims anime id when creating logs route search", () => {
    expect(createLogsRouteSearch({ mediaId: "  42  " })).toMatchObject({
      [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.mediaId]: "42",
    });
  });

  it("does not preserve whitespace-only anime ids for logs", () => {
    expect(createLogsRouteSearch({ mediaId: "   " })).toMatchObject({
      [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.mediaId]: "",
    });
  });
});
