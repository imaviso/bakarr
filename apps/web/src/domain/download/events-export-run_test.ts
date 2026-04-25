import { beforeEach, it, vi } from "vitest";

const mockedExportState = vi.hoisted(() => ({
  calls: [] as Array<{ format: "json" | "csv"; input: unknown }>,
  result: {
    exported: 3,
    format: "json" as const,
    limit: 10000,
    total: 3,
    truncated: false,
  },
}));

const mockedToastState = vi.hoisted(() => ({
  promiseCalls: 0,
}));

vi.mock("~/api", () => ({
  exportDownloadEvents: (input: unknown, format: "json" | "csv") => {
    mockedExportState.calls.push({ format, input });
    return Promise.resolve({ ...mockedExportState.result, format });
  },
}));

vi.mock("sonner", () => ({
  toast: {
    promise: <T>(promise: Promise<T>) => {
      mockedToastState.promiseCalls += 1;
      return promise;
    },
  },
}));

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

beforeEach(() => {
  mockedExportState.calls = [];
  mockedExportState.result = {
    exported: 3,
    format: "json",
    limit: 10000,
    total: 3,
    truncated: false,
  };
  mockedToastState.promiseCalls = 0;
});

it("runDownloadEventsExport calls API and invokes completion callback", async () => {
  const { runDownloadEventsExport } = await import("./events-export");

  let completedExported = 0;
  const result = await runDownloadEventsExport({
    format: "csv",
    input: { animeId: 42, limit: 5000, order: "asc" },
    onComplete: (value) => {
      completedExported = value.exported;
    },
  });

  assertEquals(mockedExportState.calls.length, 1);
  assertEquals(mockedExportState.calls[0]?.format, "csv");
  assertEquals(mockedToastState.promiseCalls, 1);
  assertEquals(result.format, "csv");
  assertEquals(completedExported, 3);
});
