import { it } from "vitest";
import {
  formatManualReleaseSearchDecisionReason,
  formatReleaseSearchDecisionReason,
  inferBatchKind,
  toBatchKindLabel,
} from "./batch-kind";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

it("toBatchKindLabel returns user-facing label", () => {
  assertEquals(toBatchKindLabel("batch"), "Batch");
  assertEquals(toBatchKindLabel("season pack"), "Season Pack");
});

it("inferBatchKind returns undefined when input is not a batch", () => {
  assertEquals(inferBatchKind({}), undefined);
});

it("inferBatchKind detects batch from episode coverage", () => {
  assertEquals(inferBatchKind({ coveredUnits: [1, 2] }), "batch");
});

it("inferBatchKind detects season packs from season identities", () => {
  assertEquals(
    inferBatchKind({
      sourceIdentity: {
        scheme: "season",
        season: 2,
        unit_numbers: [1],
        label: "S02E01",
      },
    }),
    "season pack",
  );
});

it("formatManualReleaseSearchDecisionReason includes batch and trust labels", () => {
  assertEquals(
    formatManualReleaseSearchDecisionReason({ batchKind: "batch", trusted: true }),
    "Manual batch grab from trusted release search",
  );
});

it("formatReleaseSearchDecisionReason prioritizes SeaDex labels", () => {
  assertEquals(
    formatReleaseSearchDecisionReason({ batchKind: "season pack", isSeaDexBest: true }),
    "Season Pack SeaDex Best release",
  );

  assertEquals(formatReleaseSearchDecisionReason({ isSeaDex: true }), "SeaDex recommended release");
});

it("formatReleaseSearchDecisionReason falls back to manual format", () => {
  assertEquals(
    formatReleaseSearchDecisionReason({ batchKind: "batch", trusted: true }),
    "Manual batch grab from trusted release search",
  );
});
