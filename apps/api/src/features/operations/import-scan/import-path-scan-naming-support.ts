import type { PreferredTitle, ScannedFile } from "@packages/shared/index.ts";

import { toUnitNumbers } from "@/features/operations/import-scan/import-path-scan-unit-support.ts";
import { buildEpisodeFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";

export function buildScannedFileNamingPlan(input: {
  animeRow?:
    | {
        endDate?: string | null;
        endYear?: number | null;
        format: string;
        rootFolder?: string;
        startDate?: string | null;
        startYear?: number | null;
        titleEnglish?: string | null;
        titleNative?: string | null;
        titleRomaji: string;
      }
    | undefined;
  episodeRows?: readonly { aired?: string | null; title?: string | null }[];
  file: Pick<
    ScannedFile,
    | "air_date"
    | "audio_channels"
    | "audio_codec"
    | "unit_number"
    | "unit_numbers"
    | "unit_title"
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

  const unitNumbers = toUnitNumbers(input.file);

  if (unitNumbers.length === 0) {
    return {};
  }

  const plan = buildEpisodeFilenamePlan({
    animeRow: input.animeRow,
    downloadSourceMetadata: {
      ...(input.file.air_date === undefined ? {} : { air_date: input.file.air_date }),
      ...(input.file.audio_channels === undefined
        ? {}
        : { audio_channels: input.file.audio_channels }),
      ...(input.file.audio_codec === undefined ? {} : { audio_codec: input.file.audio_codec }),
      ...(input.file.unit_title === undefined ? {} : { unit_title: input.file.unit_title }),
      ...(input.file.group === undefined ? {} : { group: input.file.group }),
      ...(input.file.quality === undefined ? {} : { quality: input.file.quality }),
      ...(input.file.resolution === undefined ? {} : { resolution: input.file.resolution }),
      ...(input.file.source_identity === undefined
        ? {}
        : { source_identity: input.file.source_identity }),
      ...(input.file.video_codec === undefined ? {} : { video_codec: input.file.video_codec }),
    },
    unitNumbers,
    ...(input.episodeRows === undefined ? {} : { episodeRows: input.episodeRows }),
    filePath: input.file.source_path,
    localMediaMetadata: {
      ...(input.file.audio_channels === undefined
        ? {}
        : { audio_channels: input.file.audio_channels }),
      ...(input.file.audio_codec === undefined ? {} : { audio_codec: input.file.audio_codec }),
      ...(input.file.resolution === undefined ? {} : { resolution: input.file.resolution }),
      ...(input.file.video_codec === undefined ? {} : { video_codec: input.file.video_codec }),
    },
    namingFormat:
      input.animeRow.format === "MOVIE"
        ? input.namingSettings.movieNamingFormat
        : input.namingSettings.namingFormat,
    preferredTitle: input.namingSettings.preferredTitle,
    ...(input.file.season === undefined ? {} : { season: input.file.season }),
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
