import { describe, expect, it } from "vitest";
import {
  createDownloadsRouteSearch,
  createLogsRouteSearch,
  DOWNLOADS_EVENTS_SEARCH_KEYS,
  LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
} from "./events-search";

describe("download events route search builders", () => {
  it("trims anime id when creating downloads route search", () => {
    expect(createDownloadsRouteSearch({ animeId: "  42  " })).toMatchObject({
      [DOWNLOADS_EVENTS_SEARCH_KEYS.animeId]: "42",
    });
  });

  it("does not preserve whitespace-only anime ids for downloads", () => {
    expect(createDownloadsRouteSearch({ animeId: "   " })).toMatchObject({
      [DOWNLOADS_EVENTS_SEARCH_KEYS.animeId]: "",
    });
  });

  it("trims anime id when creating logs route search", () => {
    expect(createLogsRouteSearch({ animeId: "  42  " })).toMatchObject({
      [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.animeId]: "42",
    });
  });

  it("does not preserve whitespace-only anime ids for logs", () => {
    expect(createLogsRouteSearch({ animeId: "   " })).toMatchObject({
      [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.animeId]: "",
    });
  });
});
