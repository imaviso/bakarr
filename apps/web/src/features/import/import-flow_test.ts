import { brandAnimeId, type AnimeSearchResult } from "@bakarr/shared";
import type { ImportFileRequest } from "~/api/contracts";
import { it } from "vitest";
import {
  buildImportFileRequest,
  buildImportSourceMetadata,
  findMissingImportCandidates,
} from "./import-flow";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

function createCandidate(id: number, englishTitle: string): AnimeSearchResult {
  return {
    id: brandAnimeId(id),
    title: {
      english: englishTitle,
    },
  };
}

it("buildImportSourceMetadata returns undefined when no metadata exists", () => {
  const metadata = buildImportSourceMetadata({});
  assertEquals(metadata, undefined);
});

it("buildImportSourceMetadata includes only defined fields", () => {
  const metadata = buildImportSourceMetadata({
    group: "SubsPlease",
    quality: "WEB-DL",
    source_identity: {
      scheme: "season",
      season: 1,
      episode_numbers: [1],
      label: "S01E01",
    },
  });

  assertDeepEquals(metadata, {
    group: "SubsPlease",
    quality: "WEB-DL",
    source_identity: {
      scheme: "season",
      season: 1,
      episode_numbers: [1],
      label: "S01E01",
    },
  });
});

it("buildImportFileRequest floors episode number and derives metadata by default", () => {
  const request = buildImportFileRequest({
    animeId: brandAnimeId(100),
    file: {
      source_path: "/imports/ep01.mkv",
      episode_number: 1.9,
      group: "SubsPlease",
    },
  });

  assertDeepEquals(request, {
    anime_id: brandAnimeId(100),
    episode_number: 1,
    source_metadata: {
      group: "SubsPlease",
    },
    source_path: "/imports/ep01.mkv",
  });
});

it("findMissingImportCandidates returns only candidate ids absent from local library", () => {
  const files: ImportFileRequest[] = [
    { anime_id: brandAnimeId(1), episode_number: 1, source_path: "/imports/a.mkv" },
    { anime_id: brandAnimeId(2), episode_number: 2, source_path: "/imports/b.mkv" },
    { anime_id: brandAnimeId(2), episode_number: 3, source_path: "/imports/c.mkv" },
  ];

  const result = findMissingImportCandidates({
    files,
    localAnimeIds: new Set([brandAnimeId(1)]),
    candidates: [createCandidate(2, "Naruto"), createCandidate(3, "Bleach")],
  });

  assertDeepEquals(
    result.map((item) => item.id),
    [2],
  );
});
