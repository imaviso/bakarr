import type { ScannedFile } from "@packages/shared/index.ts";

export function toEpisodeNumbers(file: Pick<ScannedFile, "unit_number" | "unit_numbers">) {
  if (file.unit_numbers?.length) {
    return file.unit_numbers;
  }

  return file.unit_number > 0 ? [file.unit_number] : [];
}

export function selectEpisodeRowsForFile(
  file: Pick<ScannedFile, "unit_number" | "unit_numbers">,
  rowsByAnimeEpisode: Map<
    string,
    {
      aired?: string | null;
      mediaId: number;
      number: number;
      title?: string | null;
    }
  >,
  mediaId?: number,
) {
  if (!mediaId) {
    return undefined;
  }

  const unitNumbers = toEpisodeNumbers(file);

  return unitNumbers.flatMap((unitNumber) => {
    const row = rowsByAnimeEpisode.get(`${mediaId}:${unitNumber}`);
    return row
      ? [
          {
            ...(row.aired === undefined ? {} : { aired: row.aired }),
            ...(row.title === undefined ? {} : { title: row.title }),
          },
        ]
      : [];
  });
}
