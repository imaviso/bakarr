/// <reference lib="deno.ns" />

import {
  formatDateTimeLocalInput,
  getDateRangePresetHours,
} from "./date-presets.ts";

function isoPlusMinutes(baseIso: string, minutes: number): string {
  const date = new Date(baseIso);
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

Deno.test("formatDateTimeLocalInput returns padded datetime-local format", () => {
  const value = new Date(2026, 0, 2, 3, 4, 59);
  const formatted = formatDateTimeLocalInput(value);

  if (formatted !== "2026-01-02T03:04") {
    throw new Error(`Unexpected datetime-local format: ${formatted}`);
  }
});

Deno.test("getDateRangePresetHours detects 24h, 7d, and 30d ranges", () => {
  const start = "2026-03-01T00:00:00.000Z";

  const hours24 = getDateRangePresetHours(
    start,
    isoPlusMinutes(start, 24 * 60),
  );
  if (hours24 !== 24) {
    throw new Error(`Expected 24h preset, got ${hours24}`);
  }

  const hours7d = getDateRangePresetHours(
    start,
    isoPlusMinutes(start, 24 * 7 * 60),
  );
  if (hours7d !== 168) {
    throw new Error(`Expected 7d preset, got ${hours7d}`);
  }

  const hours30d = getDateRangePresetHours(
    start,
    isoPlusMinutes(start, 24 * 30 * 60),
  );
  if (hours30d !== 720) {
    throw new Error(`Expected 30d preset, got ${hours30d}`);
  }
});

Deno.test("getDateRangePresetHours honors tolerance and rejects out-of-range values", () => {
  const start = "2026-03-01T00:00:00.000Z";

  const plusTwoMinutes = getDateRangePresetHours(
    start,
    isoPlusMinutes(start, 24 * 60 + 2),
  );
  if (plusTwoMinutes !== 24) {
    throw new Error(`Expected tolerance match for +2m, got ${plusTwoMinutes}`);
  }

  const minusTwoMinutes = getDateRangePresetHours(
    start,
    isoPlusMinutes(start, 24 * 60 - 2),
  );
  if (minusTwoMinutes !== 24) {
    throw new Error(`Expected tolerance match for -2m, got ${minusTwoMinutes}`);
  }

  const plusThreeMinutes = getDateRangePresetHours(
    start,
    isoPlusMinutes(start, 24 * 60 + 3),
  );
  if (plusThreeMinutes !== undefined) {
    throw new Error(
      `Expected no preset match for +3m, got ${plusThreeMinutes}`,
    );
  }
});

Deno.test("getDateRangePresetHours returns undefined for invalid or non-positive ranges", () => {
  if (getDateRangePresetHours("", "2026-03-01T00:00:00.000Z") !== undefined) {
    throw new Error("Expected undefined when start value is missing");
  }

  if (
    getDateRangePresetHours("invalid", "2026-03-01T00:00:00.000Z") !== undefined
  ) {
    throw new Error("Expected undefined when start value is invalid");
  }

  const sameTimestamp = getDateRangePresetHours(
    "2026-03-01T00:00:00.000Z",
    "2026-03-01T00:00:00.000Z",
  );
  if (sameTimestamp !== undefined) {
    throw new Error(
      `Expected undefined for zero-length range, got ${sameTimestamp}`,
    );
  }

  const reverseRange = getDateRangePresetHours(
    "2026-03-02T00:00:00.000Z",
    "2026-03-01T00:00:00.000Z",
  );
  if (reverseRange !== undefined) {
    throw new Error(
      `Expected undefined for reverse range, got ${reverseRange}`,
    );
  }
});
