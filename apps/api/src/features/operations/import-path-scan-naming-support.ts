import type { PreferredTitle, ScannedFile } from "@packages/shared/index.ts";

import { toEpisodeNumbers } from "@/features/operations/import-path-scan-episode-support.ts";
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
  const fileName = path.split(/[\\/]/).at(-1) ?? path;
  return fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : ".mkv";
}
