import type {
  DownloadSourceMetadata,
  ImportCandidateSelectionRequest,
  ImportCandidateSelectionResult,
  ImportFileSelection,
  ScannedFile,
} from "@packages/shared/index.ts";

export function applyImportCandidateSelection(
  input: ImportCandidateSelectionRequest,
): ImportCandidateSelectionResult {
  const selectedCandidateIds = new Set(input.selected_candidate_ids);
  const selectedFilesByPath = new Map(input.selected_files.map((file) => [file.source_path, file]));
  const shouldDeselect = selectedCandidateIds.has(input.candidate_id) && !input.force_select;

  if (shouldDeselect) {
    selectedCandidateIds.delete(input.candidate_id);

    for (const file of input.files) {
      const current = selectedFilesByPath.get(file.source_path);
      if (current && current.media_id === input.candidate_id) {
        selectedFilesByPath.delete(file.source_path);
      }
    }

    return {
      selected_candidate_ids: [...selectedCandidateIds],
      selected_files: [...selectedFilesByPath.values()],
    };
  }

  selectedCandidateIds.add(input.candidate_id);

  const candidateSeason = inferCandidateSeason(input.candidate_title);

  for (const file of input.files) {
    const fileSeason = file.season || 1;
    const currentSelection = selectedFilesByPath.get(file.source_path);

    let shouldSelect = false;
    if (candidateSeason > 1) {
      if (fileSeason === candidateSeason) {
        shouldSelect = true;
      } else if (fileSeason === 1 && !currentSelection) {
        shouldSelect = true;
      }
    } else if (!currentSelection || currentSelection.media_id === input.candidate_id) {
      shouldSelect = true;
    }

    if (shouldSelect) {
      selectedFilesByPath.set(file.source_path, buildImportFileSelection(input.candidate_id, file));
    }
  }

  return {
    selected_candidate_ids: [...selectedCandidateIds],
    selected_files: [...selectedFilesByPath.values()],
  };
}

function inferCandidateSeason(title: string) {
  const normalizedTitle = title.toLowerCase();
  const seasonMatch =
    normalizedTitle.match(/season\s+(\d+)/) || normalizedTitle.match(/(\d+)(?:nd|rd|th)\s+season/);

  if (!seasonMatch) {
    return 1;
  }

  const [matchedSeason] = seasonMatch.slice(1);
  if (!matchedSeason) {
    return 1;
  }

  const parsed = Number.parseInt(matchedSeason, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildImportFileSelection(
  mediaId: ImportCandidateSelectionRequest["candidate_id"],
  file: ScannedFile,
): ImportFileSelection {
  const sourceMetadata = toImportSourceMetadata(file);

  return {
    media_id: mediaId,
    unit_number: Math.floor(file.unit_number),
    ...(file.unit_numbers === undefined ? {} : { unit_numbers: file.unit_numbers }),
    ...(file.season === undefined ? {} : { season: file.season }),
    ...(sourceMetadata === undefined ? {} : { source_metadata: sourceMetadata }),
    source_path: file.source_path,
  };
}

function toImportSourceMetadata(file: ScannedFile): DownloadSourceMetadata | undefined {
  const metadata: DownloadSourceMetadata = {
    ...(file.air_date === undefined ? {} : { air_date: file.air_date }),
    ...(file.audio_channels === undefined ? {} : { audio_channels: file.audio_channels }),
    ...(file.audio_codec === undefined ? {} : { audio_codec: file.audio_codec }),
    ...(file.unit_title === undefined ? {} : { unit_title: file.unit_title }),
    ...(file.group === undefined ? {} : { group: file.group }),
    ...(file.quality === undefined ? {} : { quality: file.quality }),
    ...(file.resolution === undefined ? {} : { resolution: file.resolution }),
    ...(file.source_identity === undefined ? {} : { source_identity: file.source_identity }),
    ...(file.video_codec === undefined ? {} : { video_codec: file.video_codec }),
  };

  return Object.values(metadata).some((value) => value !== undefined) ? metadata : undefined;
}
