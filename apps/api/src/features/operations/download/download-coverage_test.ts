import { assert, it } from "@effect/vitest";

import {
  inferCoveredEpisodeNumbers,
  resolveReconciledBatchEpisodeNumbers,
} from "@/features/operations/download/download-coverage.ts";

it("inferCoveredEpisodeNumbers prefers explicit unique sorted mediaUnits", () => {
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [3, 1, 3, 2],
      isBatch: true,
      missingUnits: [5],
      requestedEpisode: 4,
      totalUnits: 12,
    }),
    [1, 2, 3],
  );
});

it("inferCoveredEpisodeNumbers expands batch to contiguous missing mediaUnits", () => {
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: true,
      missingUnits: [1, 3, 4, 5, 7],
      requestedEpisode: 3,
      totalUnits: 12,
    }),
    [3, 4, 5],
  );
});

it("inferCoveredEpisodeNumbers falls back to requested or total range", () => {
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: false,
      missingUnits: [],
      requestedEpisode: 6,
    }),
    [6],
  );
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: true,
      missingUnits: [],
      requestedEpisode: 10,
      totalUnits: 12,
    }),
    [10, 11, 12],
  );
});

it("resolveReconciledBatchEpisodeNumbers prefers path identity, then single-candidate coverage", () => {
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredUnits: [7, 8],
      path: "[Group] Show - 03-04 [1080p].mkv",
      totalCandidateCount: 2,
    }),
    [3, 4],
  );
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredUnits: [7, 8],
      path: "Show 2025-03-14.mkv",
      totalCandidateCount: 1,
    }),
    [7, 8],
  );
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredUnits: [7, 8],
      path: "Show 2025-03-14.mkv",
      totalCandidateCount: 2,
    }),
    [],
  );
});
