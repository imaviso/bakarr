import type { ScannedFile } from "@packages/shared/index.ts";

export function toEpisodeNumbers(file: Pick<ScannedFile, "episode_number" | "episode_numbers">) {
  if (file.episode_numbers?.length) {
    return file.episode_numbers;
  }

  return file.episode_number > 0 ? [file.episode_number] : [];
}

export function selectEpisodeRowsForFile(
  file: Pick<ScannedFile, "episode_number" | "episode_numbers">,
  rowsByAnimeEpisode: Map<
    string,
    {
      aired?: string | null;
      animeId: number;
      number: number;
      title?: string | null;
    }
  >,
  animeId?: number,
) {
  if (!animeId) {
    return undefined;
  }

  const episodeNumbers = toEpisodeNumbers(file);

  return episodeNumbers.flatMap((episodeNumber) => {
    const row = rowsByAnimeEpisode.get(`${animeId}:${episodeNumber}`);
    return row ? [{ aired: row.aired, title: row.title }] : [];
  });
}
