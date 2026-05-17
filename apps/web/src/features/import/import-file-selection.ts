import type { MediaId, ImportFileRequest, ScannedFile } from "~/api/contracts";
import { buildImportFileRequest } from "~/features/import/import-flow";

export function toggleSelectedImportFile(
  selectedFiles: Map<string, ImportFileRequest>,
  file: ScannedFile,
  targetAnimeId: MediaId,
) {
  const next = new Map(selectedFiles);
  if (next.has(file.source_path)) {
    next.delete(file.source_path);
  } else {
    next.set(file.source_path, buildImportFileRequest({ mediaId: targetAnimeId, file }));
  }
  return next;
}

export function updateSelectedImportFileAnime(
  selectedFiles: Map<string, ImportFileRequest>,
  file: ScannedFile,
  newAnimeId: MediaId,
) {
  const next = new Map(selectedFiles);
  const existing = next.get(file.source_path);
  if (!existing) {
    return next;
  }

  next.set(
    file.source_path,
    buildImportFileRequest({
      mediaId: newAnimeId,
      unitNumber: existing.unit_number,
      ...(existing.unit_numbers === undefined ? {} : { unitNumbers: existing.unit_numbers }),
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
      mediaId: current.media_id,
      unitNumber: episode,
      ...(current.unit_numbers === undefined ? {} : { unitNumbers: current.unit_numbers }),
      file,
      season,
      ...(current.source_metadata === undefined ? {} : { sourceMetadata: current.source_metadata }),
    }),
  );

  return next;
}
