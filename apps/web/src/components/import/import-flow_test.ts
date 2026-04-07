import type { AnimeSearchResult, ImportFileRequest, ScannedFile } from "~/lib/api";
import { it } from "~/test/vitest";
import {
  buildImportFileRequest,
  buildImportSourceMetadata,
  findMissingImportCandidates,
  toggleImportCandidateSelection,
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
    id,
    title: {
      english: englishTitle,
    },
  };
}

function createScannedFile(input: {
  sourcePath: string;
  episodeNumber: number;
  season?: number;
  group?: string;
}): ScannedFile {
  return {
    source_path: input.sourcePath,
    filename: `${input.sourcePath.split("/").pop() ?? "episode"}.mkv`,
    parsed_title: "Example",
    episode_number: input.episodeNumber,
    season: input.season,
    group: input.group,
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
    animeId: 100,
    file: {
      source_path: "/imports/ep01.mkv",
      episode_number: 1.9,
      group: "SubsPlease",
    },
  });

  assertDeepEquals(request, {
    anime_id: 100,
    episode_number: 1,
    source_metadata: {
      group: "SubsPlease",
    },
    source_path: "/imports/ep01.mkv",
  });
});

it("findMissingImportCandidates returns only candidate ids absent from local library", () => {
  const files: ImportFileRequest[] = [
    { anime_id: 1, episode_number: 1, source_path: "/imports/a.mkv" },
    { anime_id: 2, episode_number: 2, source_path: "/imports/b.mkv" },
    { anime_id: 2, episode_number: 3, source_path: "/imports/c.mkv" },
  ];

  const result = findMissingImportCandidates({
    files,
    localAnimeIds: new Set([1]),
    candidates: [createCandidate(2, "Naruto"), createCandidate(3, "Bleach")],
  });

  assertDeepEquals(
    result.map((item) => item.id),
    [2],
  );
});

it("toggleImportCandidateSelection selects and deselects candidate files", () => {
  const candidate = createCandidate(7, "Example Show");
  const files = [
    createScannedFile({ sourcePath: "/imports/ep01", episodeNumber: 1 }),
    createScannedFile({ sourcePath: "/imports/ep02", episodeNumber: 2 }),
  ];

  const selected = toggleImportCandidateSelection({
    candidate,
    files,
    selectedCandidateIds: new Set(),
    selectedFiles: new Map(),
  });

  assertEquals(selected.selectedCandidateIds.has(7), true);
  assertDeepEquals(
    [...selected.selectedFiles.values()].map((item) => item.anime_id),
    [7, 7],
  );

  const deselected = toggleImportCandidateSelection({
    candidate,
    files,
    selectedCandidateIds: selected.selectedCandidateIds,
    selectedFiles: selected.selectedFiles,
  });

  assertEquals(deselected.selectedCandidateIds.has(7), false);
  assertEquals(deselected.selectedFiles.size, 0);
});

it("toggleImportCandidateSelection respects candidate season matching", () => {
  const candidate = createCandidate(10, "Example Show Season 2");
  const files = [
    createScannedFile({ sourcePath: "/imports/s2e1", episodeNumber: 1, season: 2 }),
    createScannedFile({ sourcePath: "/imports/s1e5", episodeNumber: 5, season: 1 }),
  ];

  const selected = toggleImportCandidateSelection({
    candidate,
    files,
    selectedCandidateIds: new Set(),
    selectedFiles: new Map([
      ["/imports/s1e5", { anime_id: 99, episode_number: 5, source_path: "/imports/s1e5" }],
    ]),
  });

  const season2 = selected.selectedFiles.get("/imports/s2e1");
  const season1 = selected.selectedFiles.get("/imports/s1e5");

  assertEquals(season2?.anime_id, 10);
  assertEquals(season1?.anime_id, 99);
});
