import { it } from "vitest";
import { buildDownloadEventsExportInput } from "./events-query-model";

function assertDeepEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

it("buildDownloadEventsExportInput parses positive integer ids and strips all event type", () => {
  const output = buildDownloadEventsExportInput(
    {
      animeId: "42",
      downloadId: "7",
      endDate: "2026-04-01",
      eventType: "all",
      startDate: "2026-03-01",
      status: "imported",
    },
    { limit: 500, order: "asc" },
  );

  assertDeepEquals(output, {
    animeId: 42,
    downloadId: 7,
    endDate: "2026-04-01",
    limit: 500,
    order: "asc",
    startDate: "2026-03-01",
    status: "imported",
  });
});

it("buildDownloadEventsExportInput omits invalid values and uses defaults", () => {
  const output = buildDownloadEventsExportInput({
    animeId: "0",
    downloadId: "not-a-number",
    endDate: "",
    eventType: "grabbed",
    startDate: "",
    status: "",
  });

  assertDeepEquals(output, {
    eventType: "grabbed",
    limit: 10_000,
    order: "desc",
  });
});

it("buildDownloadEventsExportInput trims text filters and omits whitespace-only values", () => {
  const output = buildDownloadEventsExportInput({
    animeId: "",
    downloadId: "",
    endDate: "   ",
    eventType: "  imported  ",
    startDate: "  2026-03-01  ",
    status: "   ",
  });

  assertDeepEquals(output, {
    eventType: "imported",
    limit: 10_000,
    order: "desc",
    startDate: "2026-03-01",
  });
});
