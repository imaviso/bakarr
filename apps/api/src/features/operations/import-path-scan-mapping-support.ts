import type { FileEpisodeMapping, ScannedFile } from "@packages/shared/index.ts";

import { toEpisodeNumbers } from "@/features/operations/import-path-scan-episode-support.ts";

type EpisodeFileMappingRow = {
  anime_id: number;
  anime_title: string;
  episode_number: number;
  file_path: string | null;
};

export type EpisodeFileMappingIndex = {
  byAnimeEpisode: Map<string, EpisodeFileMappingRow>;
  byPath: Map<string, FileEpisodeMapping>;
};

export function buildEpisodeFileMappingIndex(
  rows: readonly EpisodeFileMappingRow[],
): EpisodeFileMappingIndex {
  const byAnimeEpisode = new Map<string, EpisodeFileMappingRow>();
  const byPath = new Map<string, FileEpisodeMapping>();

  for (const row of rows) {
    if (!row.file_path) {
      continue;
    }

    byAnimeEpisode.set(`${row.anime_id}:${row.episode_number}`, row);

    const existing = byPath.get(row.file_path);
    if (existing) {
      const episodeNumbers = new Set([...(existing.episode_numbers ?? []), row.episode_number]);
      byPath.set(row.file_path, {
        ...existing,
        episode_numbers: [...episodeNumbers].sort((left, right) => left - right),
      });
      continue;
    }

    byPath.set(row.file_path, {
      anime_id: row.anime_id,
      anime_title: row.anime_title,
      episode_numbers: [row.episode_number],
      file_path: row.file_path,
    });
  }

  return { byAnimeEpisode, byPath };
}

export function buildScannedFileLibrarySignals(input: {
  file: Pick<ScannedFile, "episode_number" | "episode_numbers" | "source_path">;
  mappingIndex: EpisodeFileMappingIndex;
  targetAnime?: { id: number; title: string };
}) {
  const existing_mapping = input.mappingIndex.byPath.get(input.file.source_path);
  const episodeNumbers = toEpisodeNumbers(input.file);
  const { targetAnime } = input;

  if (!targetAnime || episodeNumbers.length === 0) {
    return { existing_mapping };
  }

  const conflicts = episodeNumbers.flatMap((episodeNumber) => {
    const existing = input.mappingIndex.byAnimeEpisode.get(`${targetAnime.id}:${episodeNumber}`);

    if (!existing || existing.file_path === input.file.source_path) {
      return [];
    }

    return [existing];
  });

  if (conflicts.length === 0) {
    return { existing_mapping };
  }

  const episode_conflict: FileEpisodeMapping = {
    anime_id: targetAnime.id,
    anime_title: targetAnime.title,
    episode_numbers: [...new Set(conflicts.map((row) => row.episode_number))].sort(
      (left, right) => left - right,
    ),
    file_path: conflicts[0]?.file_path ?? undefined,
  };

  return {
    episode_conflict,
    existing_mapping,
  };
}
