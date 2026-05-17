import { brandMediaId, type FileUnitMapping, type ScannedFile } from "@packages/shared/index.ts";

import { toUnitNumbers } from "@/features/operations/import-scan/import-path-scan-unit-support.ts";

type EpisodeFileMappingRow = {
  media_id: number;
  media_title: string;
  unit_number: number;
  file_path: string | null;
};

export type EpisodeFileMappingIndex = {
  byAnimeEpisode: Map<string, EpisodeFileMappingRow>;
  byPath: Map<string, FileUnitMapping>;
};

export function buildEpisodeFileMappingIndex(
  rows: readonly EpisodeFileMappingRow[],
): EpisodeFileMappingIndex {
  const byAnimeEpisode = new Map<string, EpisodeFileMappingRow>();
  const byPath = new Map<string, FileUnitMapping>();

  for (const row of rows) {
    if (!row.file_path) {
      continue;
    }

    byAnimeEpisode.set(`${row.media_id}:${row.unit_number}`, row);

    const existing = byPath.get(row.file_path);
    if (existing) {
      const unitNumbers = new Set([...(existing.unit_numbers ?? []), row.unit_number]);
      byPath.set(row.file_path, {
        ...existing,
        unit_numbers: [...unitNumbers].toSorted((left, right) => left - right),
      });
      continue;
    }

    byPath.set(row.file_path, {
      media_id: brandMediaId(row.media_id),
      media_title: row.media_title,
      unit_numbers: [row.unit_number],
      file_path: row.file_path,
    });
  }

  return { byAnimeEpisode, byPath };
}

export function buildScannedFileLibrarySignals(input: {
  file: Pick<ScannedFile, "unit_number" | "unit_numbers" | "source_path">;
  mappingIndex: EpisodeFileMappingIndex;
  targetAnime?: { id: number; title: string } | undefined;
}) {
  const existing_mapping = input.mappingIndex.byPath.get(input.file.source_path);
  const unitNumbers = toUnitNumbers(input.file);
  const { targetAnime } = input;

  if (!targetAnime || unitNumbers.length === 0) {
    return { existing_mapping };
  }

  const conflicts = unitNumbers.flatMap((unitNumber) => {
    const existing = input.mappingIndex.byAnimeEpisode.get(`${targetAnime.id}:${unitNumber}`);

    if (!existing || existing.file_path === input.file.source_path) {
      return [];
    }

    return [existing];
  });

  if (conflicts.length === 0) {
    return { existing_mapping };
  }

  const unit_conflict: FileUnitMapping = {
    media_id: brandMediaId(targetAnime.id),
    media_title: targetAnime.title,
    unit_numbers: [...new Set(conflicts.map((row) => row.unit_number))].toSorted(
      (left, right) => left - right,
    ),
    file_path: conflicts[0]?.file_path ?? undefined,
  };

  return {
    unit_conflict,
    existing_mapping,
  };
}
