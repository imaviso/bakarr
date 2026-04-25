import type { ImportFileRequest, ScannedFile } from "~/api";
import { buildImportFileRequest } from "~/features/import/import-flow";

export function toggleSelectedImportFile(
  selectedFiles: Map<string, ImportFileRequest>,
  file: ScannedFile,
  targetAnimeId: number,
) {
  const next = new Map(selectedFiles);
  if (next.has(file.source_path)) {
    next.delete(file.source_path);
  } else {
    next.set(file.source_path, buildImportFileRequest({ animeId: targetAnimeId, file }));
  }
  return next;
}

export function updateSelectedImportFileAnime(
  selectedFiles: Map<string, ImportFileRequest>,
  file: ScannedFile,
  newAnimeId: number,
) {
  const next = new Map(selectedFiles);
  const existing = next.get(file.source_path);
  if (!existing) {
    return next;
  }

  next.set(
    file.source_path,
    buildImportFileRequest({
      animeId: newAnimeId,
      episodeNumber: existing.episode_number,
      ...(existing.episode_numbers === undefined
        ? {}
        : { episodeNumbers: existing.episode_numbers }),
      file,
      ...(existing.season === undefined ? {} : { season: existing.season }),
      ...(existing.source_metadata === undefined
        ? {}
        : { sourceMetadata: existing.source_metadata }),
    }),
  );

  return next;
}

export function updateSelectedImportFileMapping(
  selectedFiles: Map<string, ImportFileRequest>,
  file: ScannedFile,
  season: number,
  episode: number,
) {
  const next = new Map(selectedFiles);
  const current = next.get(file.source_path);
  if (!current) {
    return next;
  }

  next.set(
    file.source_path,
    buildImportFileRequest({
      animeId: current.anime_id,
      episodeNumber: episode,
      ...(current.episode_numbers === undefined ? {} : { episodeNumbers: current.episode_numbers }),
      file,
      season,
      ...(current.source_metadata === undefined ? {} : { sourceMetadata: current.source_metadata }),
    }),
  );

  return next;
}
