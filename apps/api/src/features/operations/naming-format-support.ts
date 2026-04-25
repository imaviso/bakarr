import type { NamingInput } from "@/infra/naming.ts";

import type { ResolvedNamingPlan } from "@/features/operations/naming-types.ts";

const TOKEN_FIELD_MAP = {
  air_date: "airDate",
  audio_channels: "audioChannels",
  audio_codec: "audioCodec",
  episode: "episodeNumbers",
  episode_segment: "episodeNumbers",
  episode_title: "episodeTitle",
  group: "group",
  quality: "quality",
  resolution: "resolution",
  season: "season",
  source_episode_segment: "sourceIdentity",
  title: "title",
  video_codec: "videoCodec",
  year: "year",
} as const satisfies Record<string, keyof NamingInput>;

type NamingToken = keyof typeof TOKEN_FIELD_MAP;

function isNamingToken(value: string): value is NamingToken {
  return value in TOKEN_FIELD_MAP;
}

const PROBEABLE_NAMING_FIELDS = new Set<string>([
  "audio_channels",
  "audio_codec",
  "resolution",
  "video_codec",
]);

export function selectNamingFormat(
  animeRow: { format: string },
  settings: { namingFormat: string; movieNamingFormat: string },
): string {
  return animeRow.format === "MOVIE" ? settings.movieNamingFormat : settings.namingFormat;
}

export function inspectNamingFormat(format: string): readonly NamingToken[] {
  const tokens = new Set<NamingToken>();

  for (const match of format.matchAll(/\{([a-z_]+)(?::\d+)?\}/g)) {
    const token = match[1];

    if (token && isNamingToken(token)) {
      tokens.add(token);
    }
  }

  return [...tokens];
}

export function validateNamingMetadata(
  format: string,
  metadata: NamingInput,
): { missingFields: readonly string[]; warnings: readonly string[] } {
  const missingFields = inspectNamingFormat(format)
    .filter((token) => {
      const field = TOKEN_FIELD_MAP[token];
      const value = metadata[field];

      if (field === "episodeNumbers") {
        return !Array.isArray(value) || value.length === 0;
      }

      return value === undefined || value === null || value === "";
    })
    .map((token) => token);

  return {
    missingFields,
    warnings: missingFields.map((field) => `Missing metadata for {${field}} token`),
  };
}

export function resolveFilenameRenderPlan(input: {
  animeFormat: string;
  format: string;
  metadata: NamingInput;
}): ResolvedNamingPlan {
  const validation = validateNamingMetadata(input.format, input.metadata);
  const criticalMissingFields = validation.missingFields.filter(
    (field) => field === "season" || field === "episode" || field === "episode_segment",
  );

  if (criticalMissingFields.length === 0) {
    return {
      fallbackUsed: false,
      formatUsed: input.format,
      missingFields: validation.missingFields,
      warnings: validation.warnings,
    };
  }

  const fallbackFormat = resolveFallbackNamingFormat(input.animeFormat, input.metadata);

  return {
    fallbackUsed: true,
    formatUsed: fallbackFormat,
    missingFields: validation.missingFields,
    warnings: [
      ...validation.warnings,
      "Used safe fallback naming format instead of configured format",
    ],
  };
}

export function hasMissingLocalMediaNamingFields(missingFields: readonly string[]) {
  return missingFields.some((field) => PROBEABLE_NAMING_FIELDS.has(field));
}

function resolveFallbackNamingFormat(animeFormat: string, metadata: NamingInput): string {
  if (animeFormat === "MOVIE") {
    return metadata.year ? "{title} ({year})" : "{title}";
  }

  return metadata.sourceIdentity
    ? "{title} - {source_episode_segment}"
    : "{title} - {episode_segment}";
}
