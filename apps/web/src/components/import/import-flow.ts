import type {
  AnimeSearchResult,
  DownloadSourceMetadata,
  ImportFileRequest,
  ScannedFile,
} from "~/lib/api";

export function buildImportSourceMetadata(
  file: Pick<
    ScannedFile,
    | "air_date"
    | "audio_channels"
    | "audio_codec"
    | "episode_title"
    | "group"
    | "quality"
    | "resolution"
    | "source_identity"
    | "video_codec"
  >,
): DownloadSourceMetadata | undefined {
  const metadata: DownloadSourceMetadata = {
    air_date: file.air_date,
    audio_channels: file.audio_channels,
    audio_codec: file.audio_codec,
    episode_title: file.episode_title,
    group: file.group,
    quality: file.quality,
    resolution: file.resolution,
    source_identity: file.source_identity,
    video_codec: file.video_codec,
  };

  return Object.values(metadata).some((value) => value !== undefined)
    ? metadata
    : undefined;
}

export function buildImportFileRequest(input: {
  animeId: number;
  file: Pick<
    ScannedFile,
    | "air_date"
    | "audio_channels"
    | "audio_codec"
    | "episode_number"
    | "episode_numbers"
    | "episode_title"
    | "group"
    | "quality"
    | "resolution"
    | "season"
    | "source_identity"
    | "source_path"
    | "video_codec"
  >;
  episodeNumber?: number;
  episodeNumbers?: number[];
  season?: number;
  sourceMetadata?: DownloadSourceMetadata;
}) {
  return {
    anime_id: input.animeId,
    episode_number: input.episodeNumber ??
      Math.floor(input.file.episode_number),
    episode_numbers: input.episodeNumbers ?? input.file.episode_numbers,
    season: input.season ?? input.file.season,
    source_metadata: input.sourceMetadata ??
      buildImportSourceMetadata(input.file),
    source_path: input.file.source_path,
  } satisfies ImportFileRequest;
}

export function findMissingImportCandidates(input: {
  files: readonly ImportFileRequest[];
  localAnimeIds: ReadonlySet<number>;
  candidates: readonly AnimeSearchResult[];
}) {
  const missingIds = [...new Set(input.files.map((file) => file.anime_id))]
    .filter((id) => !input.localAnimeIds.has(id));

  return missingIds.flatMap((id) => {
    const candidate = input.candidates.find((entry) => entry.id === id);
    return candidate ? [candidate] : [];
  });
}

export function toggleImportCandidateSelection(input: {
  candidate: AnimeSearchResult;
  files: readonly ScannedFile[];
  selectedCandidateIds: ReadonlySet<number>;
  selectedFiles: ReadonlyMap<string, ImportFileRequest>;
  forceSelect?: boolean;
}) {
  const newSelectedCandidates = new Set(input.selectedCandidateIds);
  const newSelectedFiles = new Map(input.selectedFiles);

  const shouldDeselect = newSelectedCandidates.has(input.candidate.id) &&
    !input.forceSelect;

  if (shouldDeselect) {
    newSelectedCandidates.delete(input.candidate.id);

    input.files.forEach((file) => {
      const current = newSelectedFiles.get(file.source_path);
      if (current && current.anime_id === input.candidate.id) {
        newSelectedFiles.delete(file.source_path);
      }
    });

    return {
      selectedCandidateIds: newSelectedCandidates,
      selectedFiles: newSelectedFiles,
    };
  }

  newSelectedCandidates.add(input.candidate.id);

  let candidateSeason = 1;
  const titleLower = (
    input.candidate.title.english ||
    input.candidate.title.romaji ||
    ""
  ).toLowerCase();

  const seasonMatch = titleLower.match(/season\s+(\d+)/) ||
    titleLower.match(/(\d+)(?:nd|rd|th)\s+season/);

  if (seasonMatch) {
    candidateSeason = Number.parseInt(seasonMatch[1], 10);
  }

  input.files.forEach((file) => {
    const fileSeason = file.season || 1;
    const currentSelection = newSelectedFiles.get(file.source_path);

    let shouldSelect = false;
    if (candidateSeason > 1) {
      if (fileSeason === candidateSeason) {
        shouldSelect = true;
      } else if (fileSeason === 1 && !currentSelection) {
        shouldSelect = true;
      }
    } else if (
      !currentSelection || currentSelection.anime_id === input.candidate.id
    ) {
      shouldSelect = true;
    }

    if (shouldSelect) {
      newSelectedFiles.set(
        file.source_path,
        buildImportFileRequest({ animeId: input.candidate.id, file }),
      );
    }
  });

  return {
    selectedCandidateIds: newSelectedCandidates,
    selectedFiles: newSelectedFiles,
  };
}
