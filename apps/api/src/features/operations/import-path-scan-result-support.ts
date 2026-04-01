import type { FileEpisodeMapping, PreferredTitle, ScannedFile } from "@packages/shared/index.ts";
import { buildEpisodeFilenamePlan } from "@/features/operations/naming-support.ts";

export function buildScannedFileNamingPlan(input: {
  animeRow?: {
    endDate?: string | null;
    endYear?: number | null;
    format: string;
    rootFolder?: string;
    startDate?: string | null;
    startYear?: number | null;
    titleEnglish?: string | null;
    titleNative?: string | null;
    titleRomaji: string;
  };
  episodeRows?: readonly { aired?: string | null; title?: string | null }[];
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
    | "source_path"
    | "source_identity"
    | "video_codec"
  >;
  namingSettings: {
    movieNamingFormat: string;
    namingFormat: string;
    preferredTitle: PreferredTitle;
  };
}) {
  if (!input.animeRow) {
    return {};
  }

  const episodeNumbers = toEpisodeNumbers(input.file);

  if (episodeNumbers.length === 0) {
    return {};
  }

  const plan = buildEpisodeFilenamePlan({
    animeRow: input.animeRow,
    downloadSourceMetadata: {
      air_date: input.file.air_date,
      audio_channels: input.file.audio_channels,
      audio_codec: input.file.audio_codec,
      episode_title: input.file.episode_title,
      group: input.file.group,
      quality: input.file.quality,
      resolution: input.file.resolution,
      source_identity: input.file.source_identity,
      video_codec: input.file.video_codec,
    },
    episodeNumbers,
    episodeRows: input.episodeRows,
    filePath: input.file.source_path,
    localMediaMetadata: {
      audio_channels: input.file.audio_channels,
      audio_codec: input.file.audio_codec,
      resolution: input.file.resolution,
      video_codec: input.file.video_codec,
    },
    namingFormat:
      input.animeRow.format === "MOVIE"
        ? input.namingSettings.movieNamingFormat
        : input.namingSettings.namingFormat,
    preferredTitle: input.namingSettings.preferredTitle,
    season: input.file.season,
  });

  return {
    naming_filename: `${plan.baseName}${extensionFromPath(input.file.source_path)}`,
    naming_fallback_used: plan.fallbackUsed || undefined,
    naming_format_used: plan.formatUsed,
    naming_metadata_snapshot: plan.metadataSnapshot,
    naming_missing_fields: plan.missingFields.length > 0 ? [...plan.missingFields] : undefined,
    naming_warnings: plan.warnings.length > 0 ? [...plan.warnings] : undefined,
  } satisfies Pick<
    ScannedFile,
    | "naming_fallback_used"
    | "naming_filename"
    | "naming_format_used"
    | "naming_metadata_snapshot"
    | "naming_missing_fields"
    | "naming_warnings"
  >;
}

function extensionFromPath(path: string) {
  return path.includes(".") ? path.slice(path.lastIndexOf(".")) : ".mkv";
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

type EpisodeFileMappingRow = {
  anime_id: number;
  anime_title: string;
  episode_number: number;
  file_path: string | null;
};

type EpisodeFileMappingIndex = {
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

function toEpisodeNumbers(file: Pick<ScannedFile, "episode_number" | "episode_numbers">) {
  if (file.episode_numbers?.length) {
    return file.episode_numbers;
  }

  return file.episode_number > 0 ? [file.episode_number] : [];
}
