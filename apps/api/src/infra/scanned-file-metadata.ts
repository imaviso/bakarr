import type { ParsedUnitIdentity as SharedParsedEpisodeIdentity } from "@packages/shared/index.ts";

export interface ScannedFileMetadata {
  readonly air_date?: string;
  readonly audio_channels?: string;
  readonly audio_codec?: string;
  readonly duration_seconds?: number;
  readonly unit_title?: string;
  readonly quality?: string;
  readonly video_codec?: string;
  readonly warnings: readonly string[];
}

export function buildScannedFileMetadata(input: {
  filePath: string;
  group?: string | undefined;
  sourceIdentity?: SharedParsedEpisodeIdentity | undefined;
}): ScannedFileMetadata {
  const warnings: string[] = [];
  const multipleEpisodes =
    input.sourceIdentity?.scheme !== "daily" &&
    (input.sourceIdentity?.unit_numbers?.length ?? 0) > 1;
  const unitTitle = input.sourceIdentity
    ? extractEpisodeTitleFromPath({
        filePath: input.filePath,
        group: input.group,
        sourceIdentity: input.sourceIdentity,
      })
    : undefined;

  if (multipleEpisodes && unitTitle) {
    warnings.push("Skipped {unit_title} because the file covers multiple mediaUnits");
  }

  if (input.sourceIdentity?.scheme === "daily") {
    warnings.push("Parsed a daily air date; set the episode number before import");
  }

  if (!input.sourceIdentity) {
    warnings.push("No reliable episode identity found in filename");
  }

  const airDate =
    input.sourceIdentity?.scheme === "daily"
      ? normalizeAirDate(input.sourceIdentity.air_dates?.[0])
      : undefined;
  const audioChannels = extractAudioChannels(input.filePath);
  const audioCodec = extractAudioCodec(input.filePath);
  const quality = extractQualitySourceLabel(input.filePath);
  const videoCodec = extractVideoCodec(input.filePath);
  const finalEpisodeTitle = multipleEpisodes ? undefined : unitTitle;

  return {
    ...(airDate ? { air_date: airDate } : {}),
    ...(audioChannels ? { audio_channels: audioChannels } : {}),
    ...(audioCodec ? { audio_codec: audioCodec } : {}),
    ...(finalEpisodeTitle ? { unit_title: finalEpisodeTitle } : {}),
    ...(quality ? { quality } : {}),
    ...(videoCodec ? { video_codec: videoCodec } : {}),
    warnings,
  };
}

export function extractEpisodeTitleFromPath(input: {
  filePath: string;
  group?: string | undefined;
  sourceIdentity?: SharedParsedEpisodeIdentity | undefined;
}) {
  if (!input.sourceIdentity) {
    return undefined;
  }

  const extensionless = stripExtension(basename(input.filePath)).replace(/^\[[^\]]+\]\s*/, "");
  const labelIndex = extensionless.toLowerCase().indexOf(input.sourceIdentity.label.toLowerCase());

  if (labelIndex < 0) {
    return undefined;
  }

  let remainder = extensionless
    .slice(labelIndex + input.sourceIdentity.label.length)
    .replace(/^[\s._-]+/, "")
    .trim();

  if (/\[[^\]]+\]/.test(remainder)) {
    remainder = remainder.replace(/\s*-\s*([^\s[\]]+)\s*$/, "");
  }

  while (true) {
    const bracketMatch = remainder.match(/\s*-?\s*\[([^\]]+)\]\s*$/);
    if (!bracketMatch) {
      break;
    }

    const content = bracketMatch[1];
    if (!content) {
      break;
    }
    const normalizedContent = content.trim();
    if (
      looksLikeMetadataTag(normalizedContent) ||
      (input.group && normalizedContent.toLowerCase() === input.group.toLowerCase())
    ) {
      remainder = remainder.slice(0, bracketMatch.index).trimEnd();
      continue;
    }

    break;
  }

  if (input.group) {
    remainder = remainder.replace(new RegExp(`\\s*-\\s*${escapeRegex(input.group)}\\s*$`, "i"), "");
  }

  remainder = remainder
    .replace(/\s*[-_]+\s*$/g, "")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return remainder.length > 0 ? remainder : undefined;
}

export function extractQualitySourceLabel(value: string) {
  const lower = value.toLowerCase();

  if (lower.includes("remux") || lower.includes("bdremux")) {
    return "BluRay Remux";
  }
  if (
    lower.includes("bluray") ||
    lower.includes("blu-ray") ||
    lower.includes("bdrip") ||
    lower.includes("bdmv") ||
    /(?:^|[\s._\-[\]()])bd(?:$|[\s._\-[\]()])/i.test(value)
  ) {
    return "BluRay";
  }
  if (lower.includes("webrip")) {
    return "WEBRip";
  }
  if (
    lower.includes("web-dl") ||
    lower.includes("webdl") ||
    /\bamzn\b/i.test(value) ||
    lower.includes("amazon") ||
    lower.includes("crunchyroll") ||
    /\bcr\b/i.test(value) ||
    /\bdsnp\b/i.test(value) ||
    lower.includes("disney") ||
    /\bnf\b/i.test(value) ||
    lower.includes("netflix") ||
    /\bhmax\b/i.test(value) ||
    lower.includes("hulu")
  ) {
    return "WEB-DL";
  }
  if (/(?:^|[\s._\-[\]])web(?:$|[\s._\-[\]])/i.test(value)) {
    return "WEB";
  }
  if (lower.includes("hdtv")) {
    return "HDTV";
  }
  if (lower.includes("dvd")) {
    return "DVD";
  }
  if (lower.includes("sdtv")) {
    return "SDTV";
  }

  return undefined;
}

export function extractVideoCodec(value: string) {
  const match = value.match(/\b(x265|hevc|h[ .-]?265|x264|avc|h[ .-]?264|av1|vp9)\b/i);
  const rawCodec = match?.[1];

  if (!rawCodec) {
    return undefined;
  }

  const codec = rawCodec.toLowerCase().replace(/[ .-]/g, "");

  switch (codec) {
    case "x265":
      return "x265";
    case "hevc":
      return "HEVC";
    case "h265":
      return "H.265";
    case "x264":
      return "x264";
    case "avc":
      return "AVC";
    case "h264":
      return "H.264";
    case "av1":
      return "AV1";
    case "vp9":
      return "VP9";
    default:
      return rawCodec;
  }
}

export function extractAudioCodec(value: string) {
  const match = value.match(/\b(truehd|eac3|ddp|ac3|dts(?:-hd)?|flac|opus|aac)\b/i);
  const rawCodec = match?.[1];

  if (!rawCodec) {
    return undefined;
  }

  const codec = rawCodec.toLowerCase();

  switch (codec) {
    case "eac3":
      return "EAC3";
    case "ddp":
      return "DDP";
    case "truehd":
      return "TrueHD";
    case "ac3":
      return "AC3";
    case "dts-hd":
      return "DTS-HD";
    case "dts":
      return "DTS";
    case "flac":
      return "FLAC";
    case "opus":
      return "Opus";
    case "aac":
      return "AAC";
    default:
      return rawCodec;
  }
}

export function extractAudioChannels(value: string) {
  const match =
    value.match(/\b(?:aac|flac|opus|ac3|eac3|ddp|truehd|dts(?:-hd)?)\s*([1-9]\.\d)\b/i) ??
    value.match(/\b([1-9]\.\d)\b/);

  if (match?.[1]) {
    return match[1];
  }

  const channelCountMatch = value.match(/\b(1|2|6|8)\s*ch\b/i);
  switch (channelCountMatch?.[1]) {
    case "1":
      return "1.0";
    case "2":
      return "2.0";
    case "6":
      return "5.1";
    case "8":
      return "7.1";
    default:
      return undefined;
  }
}

export function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeAirDate(value?: string | null) {
  const trimmed = normalizeText(value);

  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? trimmed;
}

function basename(value: string) {
  return value.split("/").pop() ?? value;
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}

const METADATA_TAG_PATTERNS: readonly RegExp[] = [
  /\b\d{3,4}p\b/i,
  /\b\d{3,4}x\d{3,4}\b/i,
  /\bv\d+\b/i,
  /\b(?:web(?:[ .-]?dl)?|webdl|webrip|bluray|blu-ray|bdrip|bdremux|bdmv|bd|remux|hdtv|dvd|sdtv)\b/i,
  /\b(?:x264|x265|h[ .-]?264|h[ .-]?265|hevc|avc|av1|vp9)\b/i,
  /\b(?:aac|flac|opus|ac3|eac3|ddp|truehd|dts(?:-hd)?)(?:[ .-]?\d(?:[ .]?\d))?\b/i,
  /\b(?:1|2|6|8)\s*ch\b/i,
  /\b(?:dual(?:[ .-]?audio)?|multi(?:[ .-]?audio)?|proper|repack|complete|batch)\b/i,
];

function looksLikeMetadataTag(value: string): boolean {
  const lower = value.trim().toLowerCase();

  if (lower.length === 0) {
    return true;
  }

  return METADATA_TAG_PATTERNS.some((pattern) => pattern.test(lower));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
