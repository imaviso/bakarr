import { assert, it } from "@effect/vitest";
import { brandQualityId } from "@packages/shared/index.ts";

import {
  resolveTriggerDownloadCoveragePlan,
  deriveTriggerDecisionReason,
} from "@/features/operations/download/download-trigger-support.ts";

it("deriveTriggerDecisionReason formats upgrade action reason", () => {
  const reason = deriveTriggerDecisionReason({
    action: {
      Upgrade: {
        is_seadex: false,
        old_quality: {
          id: brandQualityId(1),
          name: "720p",
          rank: 5,
          resolution: 720,
          source: "web",
        },
        quality: {
          id: brandQualityId(2),
          name: "1080p",
          rank: 7,
          resolution: 1080,
          source: "bluray",
        },
        reason: "Better quality available",
        score: 10,
      },
    },
    isBatch: false,
  });
  assert.deepStrictEqual(reason, "Better quality available");
});

it("deriveTriggerDecisionReason formats accept action reason", () => {
  const reason = deriveTriggerDecisionReason({
    action: {
      Accept: {
        is_seadex: false,
        quality: {
          id: brandQualityId(1),
          name: "WEB-DL 1080p",
          rank: 7,
          resolution: 1080,
          source: "web",
        },
        score: 8,
      },
    },
    isBatch: false,
  });
  assert.deepStrictEqual(reason, "Accepted (WEB-DL 1080p, score 8)");
});

it("deriveTriggerDecisionReason formats SeaDex best as decision reason", () => {
  const reason = deriveTriggerDecisionReason({
    isBatch: false,
    isSeadexBest: true,
  });
  assert.deepStrictEqual(reason, "SeaDex Best release");
});

it("deriveTriggerDecisionReason formats SeaDex recommended as decision reason", () => {
  const reason = deriveTriggerDecisionReason({
    isBatch: false,
    isSeadex: true,
  });
  assert.deepStrictEqual(reason, "SeaDex recommended release");
});

it("deriveTriggerDecisionReason appends Batch tag for SeaDex batch releases", () => {
  assert.deepStrictEqual(
    deriveTriggerDecisionReason({ isBatch: true, isSeadexBest: true }),
    "Batch SeaDex Best release",
  );
  assert.deepStrictEqual(
    deriveTriggerDecisionReason({ isBatch: true, isSeadex: true }),
    "Batch SeaDex recommended release",
  );
});

it("deriveTriggerDecisionReason formats manual grab with trusted flag", () => {
  assert.deepStrictEqual(
    deriveTriggerDecisionReason({ isBatch: false, trusted: true }),
    "Manual grab from trusted release search",
  );
  assert.deepStrictEqual(
    deriveTriggerDecisionReason({ isBatch: false }),
    "Manual grab from release search",
  );
  assert.deepStrictEqual(
    deriveTriggerDecisionReason({ isBatch: true }),
    "Manual batch grab from release search",
  );
});

it("resolveTriggerDownloadCoveragePlan defers unknown season-pack coverage", () => {
  const plan = resolveTriggerDownloadCoveragePlan({
    explicitUnitNumber: 1,
    mediaKind: "anime",
    missingUnits: [1, 2, 3, 4],
    title: "[Flugel] Chainsaw Man S01 (BD 1080p HEVC Opus) [Multi Audio]",
    totalUnits: 12,
  });

  assert.deepStrictEqual(plan.effectiveIsBatch, true);
  assert.deepStrictEqual(plan.inferredUnits, []);
  assert.deepStrictEqual(plan.requestedEpisode, 1);
  assert.deepStrictEqual(plan.inferredCoveredEpisodes, []);
});

it("resolveTriggerDownloadCoveragePlan keeps explicit episode ranges as covered units", () => {
  const plan = resolveTriggerDownloadCoveragePlan({
    mediaKind: "anime",
    missingUnits: [1, 2, 3, 4],
    title: "[SubsPlease] Show - S01E02-E04 [1080p WEB-DL]",
    totalUnits: 12,
  });

  assert.deepStrictEqual(plan.effectiveIsBatch, true);
  assert.deepStrictEqual(plan.inferredUnits, [2, 3, 4]);
  assert.deepStrictEqual(plan.requestedEpisode, 2);
  assert.deepStrictEqual(plan.inferredCoveredEpisodes, [2, 3, 4]);
});
