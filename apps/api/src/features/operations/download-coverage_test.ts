import { assert, it } from "@effect/vitest";

import {
  inferCoveredEpisodeNumbers,
  resolveReconciledBatchEpisodeNumbers,
} from "@/features/operations/download-coverage.ts";

it("inferCoveredEpisodeNumbers prefers explicit unique sorted episodes", () => {
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [3, 1, 3, 2],
      isBatch: true,
      missingEpisodes: [5],
      requestedEpisode: 4,
      totalEpisodes: 12,
    }),
    [1, 2, 3],
  );
});

it("inferCoveredEpisodeNumbers expands batch to contiguous missing episodes", () => {
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: true,
      missingEpisodes: [1, 3, 4, 5, 7],
      requestedEpisode: 3,
      totalEpisodes: 12,
    }),
    [3, 4, 5],
  );
});

it("inferCoveredEpisodeNumbers falls back to requested or total range", () => {
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: false,
      missingEpisodes: [],
      requestedEpisode: 6,
    }),
    [6],
  );
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: true,
      missingEpisodes: [],
      requestedEpisode: 10,
      totalEpisodes: 12,
    }),
    [10, 11, 12],
  );
});

it("resolveReconciledBatchEpisodeNumbers prefers path identity, then single-candidate coverage", () => {
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredEpisodes: [7, 8],
      path: "[Group] Show - 03-04 [1080p].mkv",
      totalCandidateCount: 2,
    }),
    [3, 4],
  );
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredEpisodes: [7, 8],
      path: "Show 2025-03-14.mkv",
      totalCandidateCount: 1,
    }),
    [7, 8],
  );
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredEpisodes: [7, 8],
      path: "Show 2025-03-14.mkv",
      totalCandidateCount: 2,
    }),
    [],
  );
});
