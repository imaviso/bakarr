type MediaMetadataInput = {
  audio_channels?: string | undefined;
  audio_codec?: string | undefined;
  duration_seconds?: number | undefined;
  group?: string | undefined;
  quality?: string | undefined;
  resolution?: string | undefined;
  video_codec?: string | undefined;
};

type NamingMetadataSnapshot = {
  air_date?: string | undefined;
  audio_channels?: string | undefined;
  audio_codec?: string | undefined;
  duration_seconds?: number | undefined;
  episode_title?: string | undefined;
  group?: string | undefined;
  quality?: string | undefined;
  resolution?: string | undefined;
  season?: number | undefined;
  source_identity?: { label: string } | undefined;
  title_source?:
    | "preferred_english"
    | "preferred_native"
    | "preferred_romaji"
    | "fallback_english"
    | "fallback_native"
    | "fallback_romaji"
    | undefined;
  video_codec?: string | undefined;
  year?: number | undefined;
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

export function formatDurationSeconds(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

export function formatFileSize(size?: number) {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return undefined;
  }

  if (size >= 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatMatchConfidence(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}% match`;
}

export function formatEpisodeNumberList(numbers?: readonly number[]) {
  if (!numbers?.length) {
    return undefined;
  }

  return numbers.length === 1 ? `Episode ${numbers[0]}` : `Episodes ${numbers.join(", ")}`;
}

export function formatFileEpisodeMapping(input?: {
  anime_title: string;
  episode_numbers?: readonly number[] | undefined;
}) {
  if (!input) {
    return undefined;
  }

  const episodeLabel = formatEpisodeNumberList(input.episode_numbers);

  return episodeLabel ? `${input.anime_title} (${episodeLabel})` : input.anime_title;
}

export function buildFileDecisionSummary(input: {
  coverage_summary?: string | undefined;
  existing_mapping?:
    | {
        anime_title: string;
        episode_numbers?: readonly number[] | undefined;
      }
    | undefined;
  episode_conflict?:
    | {
        anime_title: string;
        episode_numbers?: readonly number[] | undefined;
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

  const episodeConflict = formatFileEpisodeMapping(input.episode_conflict);
  if (episodeConflict) {
    details.push(`Existing file for ${episodeConflict}`);
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
    formatDurationSeconds(snapshot.duration_seconds),
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
