import { it } from "~/test/vitest";
import {
  backgroundMatchingStatusLabel,
  backgroundMatchingStatusVariant,
  isBackgroundMatchingRunning,
} from "./background-matching-state";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

it("background matching is not running when job flag is stale but no work remains", () => {
  const input = {
    failedCount: 0,
    hasOutstandingWork: false,
    job: {
      is_running: true,
      last_status: "running",
      name: "unmapped_scan",
      run_count: 1,
    },
    matchingCount: 0,
    pausedCount: 0,
  };

  assertEquals(isBackgroundMatchingRunning(input), false);
  assertEquals(backgroundMatchingStatusLabel(input), "Idle");
  assertEquals(backgroundMatchingStatusVariant(input), "outline");
});

it("background matching is running while a folder is actively matching", () => {
  const input = {
    failedCount: 0,
    hasOutstandingWork: true,
    job: {
      is_running: false,
      last_status: "success",
      name: "unmapped_scan",
      run_count: 2,
    },
    matchingCount: 1,
    pausedCount: 0,
  };

  assertEquals(isBackgroundMatchingRunning(input), true);
  assertEquals(backgroundMatchingStatusLabel(input), "Running");
  assertEquals(backgroundMatchingStatusVariant(input), "secondary");
});

it("background matching is queued when work remains but nothing is active", () => {
  const input = {
    failedCount: 0,
    hasOutstandingWork: true,
    job: {
      is_running: false,
      last_status: "success",
      name: "unmapped_scan",
      run_count: 2,
    },
    matchingCount: 0,
    pausedCount: 0,
  };

  assertEquals(isBackgroundMatchingRunning(input), false);
  assertEquals(backgroundMatchingStatusLabel(input), "Queued");
});
