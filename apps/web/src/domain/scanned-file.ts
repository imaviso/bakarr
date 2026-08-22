import { clampConfidencePercent, formatDurationSeconds } from "~/domain/format";
import type { RenamePreviewMetadataSnapshot } from "~/api/contracts";

export { formatDurationSeconds, formatFileSize } from "~/domain/format";

type MediaMetadataInput = {
  audio_channels?: string | undefined;
  audio_codec?: string | undefined;
  duration_seconds?: number | undefined;
  group?: string | undefined;
  quality?: string | undefined;
  resolution?: string | undefined;
  video_codec?: string | undefined;
};

type NamingMetadataSnapshot = Omit<RenamePreviewMetadataSnapshot, "title"> & {
  duration_seconds?: number | undefined;
};

export function mediaMetadataBadges(input: MediaMetadataInput) {
  const audio = [input.audio_codec, input.audio_channels]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" ");

  return [
    input.quality,
    input.resolution,
    formatDurationSeconds(input.duration_seconds),
    input.video_codec,
    audio || undefined,
    input.group,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function formatMatchConfidence(value?: number) {
  const percent = clampConfidencePercent(value);
  return percent === undefined ? undefined : `${percent}% match`;
}

export function formatEpisodeNumberList(numbers?: readonly number[]) {
  if (!numbers?.length) {
    return undefined;
  }

  return numbers.length === 1 ? `MediaUnit ${numbers[0]}` : `Episodes ${numbers.join(", ")}`;
}

export function formatFileEpisodeMapping(input?: {
  media_title: string;
  unit_numbers?: readonly number[] | undefined;
}) {
  if (!input) {
    return undefined;
  }

  const unitLabel = formatEpisodeNumberList(input.unit_numbers);

  return unitLabel ? `${input.media_title} (${unitLabel})` : input.media_title;
}

export function buildFileDecisionSummary(input: {
  coverage_summary?: string | undefined;
  existing_mapping?:
    | {
        media_title: string;
        unit_numbers?: readonly number[] | undefined;
      }
    | undefined;
  unit_conflict?:
    | {
        media_title: string;
        unit_numbers?: readonly number[] | undefined;
      }
    | undefined;
  match_reason?: string | undefined;
  warnings?: readonly string[] | undefined;
}) {
  const details: string[] = [];

  if (input.coverage_summary) {
    details.push(input.coverage_summary);
  }

  const existingMapping = formatFileEpisodeMapping(input.existing_mapping);
  if (existingMapping) {
    details.push(`Already mapped to ${existingMapping}`);
  }

  const unitConflict = formatFileEpisodeMapping(input.unit_conflict);
  if (unitConflict) {
    details.push(`Existing file for ${unitConflict}`);
  }

  if (input.match_reason) {
    details.push(input.match_reason);
  }

  if (input.warnings?.length) {
    details.push(...input.warnings);
  }

  return details;
}

export function formatNamingTitleSource(value?: NamingMetadataSnapshot["title_source"]) {
  switch (value) {
    case "preferred_english":
      return "Preferred English";
    case "preferred_native":
      return "Preferred Native";
    case "preferred_romaji":
      return "Preferred Romaji";
    case "fallback_english":
      return "Fallback English";
    case "fallback_native":
      return "Fallback Native";
    case "fallback_romaji":
      return "Fallback Romaji";
    default:
      return undefined;
  }
}

export function namingMetadataBadges(snapshot?: NamingMetadataSnapshot) {
  if (!snapshot) {
    return [];
  }

  return [
    snapshot.source_identity?.label,
    snapshot.season !== undefined ? `Season ${snapshot.season}` : undefined,
    snapshot.year !== undefined ? String(snapshot.year) : undefined,
    "duration_seconds" in snapshot ? formatDurationSeconds(snapshot.duration_seconds) : undefined,
    snapshot.group,
    [snapshot.quality, snapshot.resolution].filter(Boolean).join(" ") || undefined,
    snapshot.video_codec,
    [snapshot.audio_codec, snapshot.audio_channels].filter(Boolean).join(" ") || undefined,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function summarizeImportNamingOutcome(
  importedFiles?: readonly {
    naming_fallback_used?: boolean | undefined;
    naming_warnings?: readonly string[] | undefined;
  }[],
) {
  if (!importedFiles?.length) {
    return undefined;
  }

  const fallbackCount = importedFiles.filter((file) => file.naming_fallback_used).length;
  const warningCount = importedFiles.filter(
    (file) => (file.naming_warnings?.length ?? 0) > 0,
  ).length;
  const details = [
    fallbackCount > 0 ? `${fallbackCount} used fallback naming` : undefined,
    warningCount > 0 ? `${warningCount} had naming warnings` : undefined,
  ].filter((value): value is string => value !== undefined);

  return details.length > 0 ? details.join("; ") : undefined;
}
