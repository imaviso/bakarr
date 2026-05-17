import { assert, it } from "@effect/vitest";

import {
  inferCoveredEpisodesFromTorrentContents,
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

it("resolveReconciledBatchEpisodeNumbers parses literature volume files when enabled", () => {
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredUnits: [],
      parseVolumeNumbers: true,
      path: "Overlord v01 - The Undead King [Yen Press] [LuCaZ] {r3}.epub",
      totalCandidateCount: 16,
    }),
    [1],
  );
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredUnits: [],
      path: "Overlord v01 - The Undead King [Yen Press] [LuCaZ] {r3}.epub",
      totalCandidateCount: 16,
    }),
    [],
  );
});

it("inferCoveredEpisodesFromTorrentContents parses qBittorrent literature file lists", () => {
  assert.deepStrictEqual(
    inferCoveredEpisodesFromTorrentContents({
      files: [
        qbitFile("Overlord v01 - The Undead King [Yen Press] [LuCaZ] {r3}.epub"),
        qbitFile("Overlord v02 - The Dark Warrior [Yen Press] [LuCaZ] {r2}.epub"),
        qbitFile("Overlord v16 - The Half-Elf Demigod (Part II) [Yen Press] [LuCaZ].epub"),
      ],
      parseVolumeNumbers: true,
      rootName: "Overlord [Yen Press] [LuCaZ]",
    }),
    [1, 2, 16],
  );
});

function qbitFile(name: string) {
  return {
    is_seed: false,
    name,
    priority: 1,
    progress: 1,
    size: 1,
  };
}
