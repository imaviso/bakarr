import type {
  DownloadSourceMetadata,
  ImportCandidateSelectionRequest,
  ImportCandidateSelectionResult,
  ImportFileMappingRequest,
  ImportFileMediaRequest,
  ImportFileSelection,
  ImportFileToggleRequest,
  ImportSelectAllRequest,
  MediaId,
  ScannedFile,
} from "@packages/shared/index.ts";

export function hasUsableImportUnits(
  file: Pick<ScannedFile, "unit_number" | "unit_numbers">,
): boolean {
  if (Number.isFinite(file.unit_number) && Math.floor(file.unit_number) > 0) {
    return true;
  }

  return (file.unit_numbers ?? []).some((value) => Number.isFinite(value) && Math.floor(value) > 0);
}

export function normalizeImportUnitNumber(value: number): number {
  return Math.floor(value);
}

export function normalizeImportUnitNumbers(
  values: readonly number[] | undefined | null,
  fallback: number,
): number[] | undefined {
  const source = values?.length ? values : [fallback];
  const normalized = [
    ...new Set(
      source
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.floor(value))
        .filter((value) => value > 0),
    ),
  ].toSorted((left, right) => left - right);

  return normalized.length > 0 ? normalized : undefined;
}

export function importFileAffinity(
  file: Pick<ScannedFile, "matched_media" | "suggested_candidate_id">,
): MediaId | undefined {
  return file.matched_media?.id ?? file.suggested_candidate_id ?? undefined;
}

export function buildInitialImportSelection(
  files: readonly ScannedFile[],
): ImportCandidateSelectionResult {
  const selectedCandidateIds = new Set<MediaId>();
  const selectedFilesByPath = new Map<string, ImportFileSelection>();

  for (const file of files) {
    const affinity = importFileAffinity(file);

    if (affinity === undefined || !hasUsableImportUnits(file)) {
      continue;
    }

    selectedCandidateIds.add(affinity);
    selectedFilesByPath.set(file.source_path, buildImportFileSelection(affinity, file));
  }

  return {
    selected_candidate_ids: [...selectedCandidateIds],
    selected_files: [...selectedFilesByPath.values()],
  };
}

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

  for (const file of input.files) {
    if (selectedFilesByPath.has(file.source_path) || !hasUsableImportUnits(file)) {
      continue;
    }

    const affinity = importFileAffinity(file);
    const shouldSelect =
      affinity === input.candidate_id || (input.force_select && affinity == null);

    if (shouldSelect) {
      selectedFilesByPath.set(file.source_path, buildImportFileSelection(input.candidate_id, file));
    }
  }

  return {
    selected_candidate_ids: [...selectedCandidateIds],
    selected_files: [...selectedFilesByPath.values()],
  };
}

export function toggleImportFileSelection(
  input: ImportFileToggleRequest,
): ImportCandidateSelectionResult {
  const selectedCandidateIds = new Set(input.selected_candidate_ids);
  const selectedFilesByPath = new Map(input.selected_files.map((file) => [file.source_path, file]));
  const current = selectedFilesByPath.get(input.source_path);

  if (current) {
    selectedFilesByPath.delete(input.source_path);
    pruneOrphanedCandidate(selectedCandidateIds, selectedFilesByPath, current.media_id);

    return {
      selected_candidate_ids: [...selectedCandidateIds],
      selected_files: [...selectedFilesByPath.values()],
    };
  }

  const file = input.files.find((entry) => entry.source_path === input.source_path);

  if (!file || !hasUsableImportUnits(file)) {
    return {
      selected_candidate_ids: [...selectedCandidateIds],
      selected_files: [...selectedFilesByPath.values()],
    };
  }

  const target = input.media_id ?? importFileAffinity(file);

  if (target === undefined || target === null) {
    return {
      selected_candidate_ids: [...selectedCandidateIds],
      selected_files: [...selectedFilesByPath.values()],
    };
  }

  selectedCandidateIds.add(target);
  selectedFilesByPath.set(input.source_path, buildImportFileSelection(target, file));

  return {
    selected_candidate_ids: [...selectedCandidateIds],
    selected_files: [...selectedFilesByPath.values()],
  };
}

export function setImportFileMediaSelection(
  input: ImportFileMediaRequest,
): ImportCandidateSelectionResult {
  const selectedCandidateIds = new Set(input.selected_candidate_ids);
  const selectedFilesByPath = new Map(input.selected_files.map((file) => [file.source_path, file]));
  const file = input.files.find((entry) => entry.source_path === input.source_path);

  if (!file) {
    return {
      selected_candidate_ids: [...selectedCandidateIds],
      selected_files: [...selectedFilesByPath.values()],
    };
  }

  const current = selectedFilesByPath.get(input.source_path);
  const next = buildImportFileSelectionFromCurrent(input.media_id, file, current);

  if (!next) {
    return {
      selected_candidate_ids: [...selectedCandidateIds],
      selected_files: [...selectedFilesByPath.values()],
    };
  }

  if (current && current.media_id !== input.media_id) {
    pruneOrphanedCandidate(selectedCandidateIds, selectedFilesByPath, current.media_id);
  }

  selectedCandidateIds.add(input.media_id);
  selectedFilesByPath.set(input.source_path, next);

  return {
    selected_candidate_ids: [...selectedCandidateIds],
    selected_files: [...selectedFilesByPath.values()],
  };
}

export function setImportFileMappingSelection(
  input: ImportFileMappingRequest,
): ImportCandidateSelectionResult {
  const unitNumber = Math.floor(input.unit_number);

  if (!Number.isFinite(unitNumber) || unitNumber < 1) {
    return {
      selected_candidate_ids: [...input.selected_candidate_ids],
      selected_files: [...input.selected_files],
    };
  }

  const season =
    input.season === undefined || input.season === null ? undefined : Math.floor(input.season);

  if (season !== undefined && (!Number.isFinite(season) || season < 0)) {
    return {
      selected_candidate_ids: [...input.selected_candidate_ids],
      selected_files: [...input.selected_files],
    };
  }

  const selectedCandidateIds = new Set(input.selected_candidate_ids);
  const selectedFilesByPath = new Map(input.selected_files.map((file) => [file.source_path, file]));
  const file = input.files.find((entry) => entry.source_path === input.source_path);
  const current = selectedFilesByPath.get(input.source_path);
  const mediaId = current?.media_id ?? (file ? importFileAffinity(file) : undefined);

  if (!file || mediaId === undefined) {
    return {
      selected_candidate_ids: [...selectedCandidateIds],
      selected_files: [...selectedFilesByPath.values()],
    };
  }

  const unitNumbers = normalizeImportUnitNumbers(
    current?.unit_numbers ?? file.unit_numbers,
    unitNumber,
  );

  if (unitNumbers === undefined) {
    return {
      selected_candidate_ids: [...selectedCandidateIds],
      selected_files: [...selectedFilesByPath.values()],
    };
  }

  const sourceMetadata = current?.source_metadata ?? toImportSourceMetadata(file);

  selectedCandidateIds.add(mediaId);
  selectedFilesByPath.set(input.source_path, {
    media_id: mediaId,
    unit_number: unitNumber,
    ...(unitNumbers.length === 1 && unitNumbers[0] === unitNumber
      ? {}
      : { unit_numbers: unitNumbers }),
    ...(season === undefined && current?.season === undefined && file.season === undefined
      ? {}
      : {
          season: season ?? current?.season ?? file.season ?? undefined,
        }),
    ...(sourceMetadata === undefined ? {} : { source_metadata: sourceMetadata }),
    source_path: input.source_path,
  });

  return {
    selected_candidate_ids: [...selectedCandidateIds],
    selected_files: [...selectedFilesByPath.values()],
  };
}

export function selectAllImportFiles(
  input: ImportSelectAllRequest,
): ImportCandidateSelectionResult {
  return buildInitialImportSelection(input.files);
}

function pruneOrphanedCandidate(
  candidateIds: Set<MediaId>,
  selectedFilesByPath: Map<string, ImportFileSelection>,
  mediaId: MediaId,
): void {
  for (const file of selectedFilesByPath.values()) {
    if (file.media_id === mediaId) {
      return;
    }
  }

  candidateIds.delete(mediaId);
}

function buildImportFileSelectionFromCurrent(
  mediaId: MediaId,
  file: ScannedFile,
  current: ImportFileSelection | undefined,
): ImportFileSelection | undefined {
  const unitNumber =
    current !== undefined
      ? normalizeImportUnitNumber(current.unit_number)
      : normalizeImportUnitNumber(file.unit_number);
  const unitNumbers = normalizeImportUnitNumbers(
    current?.unit_numbers ?? file.unit_numbers,
    unitNumber,
  );

  if (!Number.isFinite(unitNumber) || unitNumber < 1 || unitNumbers === undefined) {
    if (current === undefined) {
      return undefined;
    }

    const fallbackUnits = normalizeImportUnitNumbers(current.unit_numbers, current.unit_number);

    if (fallbackUnits === undefined) {
      return undefined;
    }

    return {
      media_id: mediaId,
      unit_number: normalizeImportUnitNumber(current.unit_number),
      ...(current.unit_numbers === undefined ? {} : { unit_numbers: fallbackUnits }),
      ...(current.season === undefined ? {} : { season: current.season }),
      ...(current.source_metadata === undefined
        ? {}
        : { source_metadata: current.source_metadata }),
      source_path: current.source_path,
    };
  }

  const season = current?.season ?? file.season ?? undefined;
  const sourceMetadata = current?.source_metadata ?? toImportSourceMetadata(file);

  return {
    media_id: mediaId,
    unit_number: unitNumber,
    ...(unitNumbers.length === 1 && unitNumbers[0] === unitNumber
      ? {}
      : { unit_numbers: unitNumbers }),
    ...(season === undefined ? {} : { season }),
    ...(sourceMetadata === undefined ? {} : { source_metadata: sourceMetadata }),
    source_path: file.source_path,
  };
}

export function buildImportFileSelection(
  mediaId: ImportCandidateSelectionRequest["candidate_id"],
  file: ScannedFile,
): ImportFileSelection {
  const unitNumber = normalizeImportUnitNumber(file.unit_number);
  const unitNumbers = normalizeImportUnitNumbers(file.unit_numbers, unitNumber);
  const sourceMetadata = toImportSourceMetadata(file);

  return {
    media_id: mediaId,
    unit_number: unitNumber,
    ...(unitNumbers === undefined || (unitNumbers.length === 1 && unitNumbers[0] === unitNumber)
      ? {}
      : { unit_numbers: unitNumbers }),
    ...(file.season === undefined ? {} : { season: file.season }),
    ...(sourceMetadata === undefined ? {} : { source_metadata: sourceMetadata }),
    source_path: file.source_path,
  };
}

export function toImportSourceMetadata(file: ScannedFile): DownloadSourceMetadata | undefined {
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
