import { describe, expect, it } from "vitest";
import type { ImportFileRequest, ScannedFile } from "~/api/contracts";
import {
  toggleSelectedImportFile,
  updateSelectedImportFileAnime,
  updateSelectedImportFileMapping,
} from "./import-file-selection";

function scannedFile(overrides: Partial<ScannedFile> = {}): ScannedFile {
  return {
    episode_number: 1,
    filename: "episode-01.mkv",
    parsed_title: "Show",
    source_path: "/imports/show/episode-01.mkv",
    ...overrides,
  };
}

describe("import file selection", () => {
  it("selects a file without mutating the existing selection", () => {
    const selected = new Map<string, ImportFileRequest>();
    const file = scannedFile({ group: "SubsPlease", quality: "WEB-DL", season: 2 });

    const next = toggleSelectedImportFile(selected, file, 100);

    expect(selected.size).toBe(0);
    expect(next.get(file.source_path)).toEqual({
      anime_id: 100,
      episode_number: 1,
      season: 2,
      source_metadata: {
        group: "SubsPlease",
        quality: "WEB-DL",
      },
      source_path: file.source_path,
    });
  });

  it("deselects an already selected file", () => {
    const file = scannedFile();
    const selected = new Map<string, ImportFileRequest>([
      [file.source_path, { anime_id: 100, episode_number: 1, source_path: file.source_path }],
    ]);

    const next = toggleSelectedImportFile(selected, file, 100);

    expect(selected.size).toBe(1);
    expect(next.has(file.source_path)).toBe(false);
  });

  it("updates anime while preserving explicit mapping and metadata", () => {
    const file = scannedFile({ episode_number: 9, season: 9 });
    const selected = new Map<string, ImportFileRequest>([
      [
        file.source_path,
        {
          anime_id: 100,
          episode_number: 3,
          episode_numbers: [3, 4],
          season: 1,
          source_metadata: { group: "Manual" },
          source_path: file.source_path,
        },
      ],
    ]);

    const next = updateSelectedImportFileAnime(selected, file, 200);

    expect(selected.get(file.source_path)?.anime_id).toBe(100);
    expect(next.get(file.source_path)).toEqual({
      anime_id: 200,
      episode_number: 3,
      episode_numbers: [3, 4],
      season: 1,
      source_metadata: { group: "Manual" },
      source_path: file.source_path,
    });
  });

  it("updates episode mapping while preserving anime and batch episodes", () => {
    const file = scannedFile({ episode_number: 9, season: 9 });
    const selected = new Map<string, ImportFileRequest>([
      [
        file.source_path,
        {
          anime_id: 100,
          episode_number: 3,
          episode_numbers: [3, 4],
          season: 1,
          source_path: file.source_path,
        },
      ],
    ]);

    const next = updateSelectedImportFileMapping(selected, file, 2, 8);

    expect(selected.get(file.source_path)?.episode_number).toBe(3);
    expect(next.get(file.source_path)).toEqual({
      anime_id: 100,
      episode_number: 8,
      episode_numbers: [3, 4],
      season: 2,
      source_path: file.source_path,
    });
  });
});
