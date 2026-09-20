import { it } from "vitest";
import {
  backgroundMatchingStatusLabel,
  backgroundMatchingStatusVariant,
} from "./background-matching-state";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

it("background matching maps server running status", () => {
  assertEquals(backgroundMatchingStatusLabel("running"), "Running");
  assertEquals(backgroundMatchingStatusVariant("running"), "secondary");
});

it("background matching maps server idle status", () => {
  assertEquals(backgroundMatchingStatusLabel("idle"), "Idle");
  assertEquals(backgroundMatchingStatusVariant("idle"), "outline");
});

it("background matching maps server failed status", () => {
  assertEquals(backgroundMatchingStatusLabel("failed"), "Failed");
  assertEquals(backgroundMatchingStatusVariant("failed"), "destructive");
});
