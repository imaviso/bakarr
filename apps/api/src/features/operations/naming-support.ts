import type { NamingInput } from "../../lib/naming.ts";
import {
  buildPathParseContext,
  type ParsedEpisodeIdentity,
  parseFileSourceIdentity,
} from "../../lib/media-identity.ts";

export function buildEpisodeNamingInputFromPath(input: {
  animeStartDate?: string | null;
  animeTitle: string;
  airDate?: string | null;
  episodeNumbers: readonly number[];
  episodeTitle?: string | null;
  filePath: string;
  rootFolder?: string;
  season?: number;
}): NamingInput {
  const context = input.rootFolder &&
      input.filePath.replace(/\/+$/, "").startsWith(
        input.rootFolder.replace(/\/+$/, "") + "/",
      )
    ? buildPathParseContext(input.rootFolder, input.filePath)
    : undefined;
  const parsed = parseFileSourceIdentity(input.filePath, context);
  const sourceIdentity = parsed.source_identity;
  const group = parsed.group;

  return {
    airDate: normalizeAirDate(input.airDate),
    audioChannels: extractAudioChannels(input.filePath),
    audioCodec: extractAudioCodec(input.filePath),
    episodeNumbers: [...input.episodeNumbers],
    episodeTitle: normalizeText(input.episodeTitle) ??
      extractEpisodeTitleFromPath({
        filePath: input.filePath,
        group,
        sourceIdentity,
      }),
    group,
    quality: extractQualitySourceLabel(input.filePath),
    resolution: parsed.resolution,
    season: sourceIdentity?.scheme === "season"
      ? sourceIdentity.season
      : input.season,
    sourceIdentity,
    title: input.animeTitle,
    videoCodec: extractVideoCodec(input.filePath),
    year: extractYearFromIsoDate(input.animeStartDate),
  };
}

function extractEpisodeTitleFromPath(input: {
  filePath: string;
  group?: string;
  sourceIdentity?: ParsedEpisodeIdentity;
}) {
  if (!input.sourceIdentity) {
    return undefined;
  }

  const extensionless = stripExtension(basename(input.filePath)).replace(
    /^\[[^\]]+\]\s*/,
    "",
  );
  const labelIndex = extensionless.toLowerCase().indexOf(
    input.sourceIdentity.label.toLowerCase(),
  );

  if (labelIndex < 0) {
    return undefined;
  }

  let remainder = extensionless.slice(
    labelIndex + input.sourceIdentity.label.length,
  )
    .replace(/^[\s._-]+/, "")
    .trim();

  while (true) {
    const bracketMatch = remainder.match(/\s*-?\s*\[([^\]]+)\]\s*$/);
    if (!bracketMatch) {
      break;
    }

    const content = bracketMatch[1].trim();
    if (
      looksLikeMetadataTag(content) ||
      (input.group && content.toLowerCase() === input.group.toLowerCase())
    ) {
      remainder = remainder.slice(0, bracketMatch.index).trimEnd();
      continue;
    }

    break;
  }

  if (input.group) {
    remainder = remainder.replace(
      new RegExp(`\\s*-\\s*${escapeRegex(input.group)}\\s*$`, "i"),
      "",
    );
  }

  remainder = remainder
    .replace(/\s*[-_]+\s*$/g, "")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return remainder.length > 0 ? remainder : undefined;
}

function extractQualitySourceLabel(value: string) {
  const lower = value.toLowerCase();

  if (lower.includes("remux") || lower.includes("bdremux")) {
    return "BluRay Remux";
  }
  if (
    lower.includes("bluray") || lower.includes("blu-ray") ||
    lower.includes("bdrip")
  ) {
    return "BluRay";
  }
  if (lower.includes("webrip")) {
    return "WEBRip";
  }
  if (
    lower.includes("web-dl") || lower.includes("webdl") ||
    /\bamzn\b/i.test(value) || lower.includes("amazon") ||
    lower.includes("crunchyroll") || /\bcr\b/i.test(value) ||
    /\bdsnp\b/i.test(value) || lower.includes("disney") ||
    /\bnf\b/i.test(value) || lower.includes("netflix") ||
    /\bhmax\b/i.test(value) || lower.includes("hulu")
  ) {
    return "WEB-DL";
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

function extractVideoCodec(value: string) {
  const match = value.match(
    /\b(x265|hevc|h[ .-]?265|x264|avc|h[ .-]?264|av1)\b/i,
  );

  if (!match) {
    return undefined;
  }

  const codec = match[1].toLowerCase().replace(/[ .-]/g, "");

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
    default:
      return match[1];
  }
}

function extractAudioCodec(value: string) {
  const match = value.match(/\b(eac3|ddp|ac3|dts(?:-hd)?|flac|opus|aac)\b/i);

  if (!match) {
    return undefined;
  }

  const codec = match[1].toLowerCase();

  switch (codec) {
    case "eac3":
      return "EAC3";
    case "ddp":
      return "DDP";
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
      return match[1];
  }
}

function extractAudioChannels(value: string) {
  const match = value.match(
    /\b(?:aac|flac|opus|ac3|eac3|ddp|dts(?:-hd)?)\s*([1-9]\.\d)\b/i,
  ) ?? value.match(/\b([1-9]\.\d)\b/);

  return match?.[1];
}

function extractYearFromIsoDate(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAirDate(value?: string | null) {
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

function looksLikeMetadataTag(value: string): boolean {
  const lower = value.trim().toLowerCase();

  if (lower.length === 0) {
    return true;
  }

  return [
    /\b\d{3,4}p\b/i,
    /\b\d{3,4}x\d{3,4}\b/i,
    /\bv\d+\b/i,
    /\b(?:web(?:[ .-]?dl)?|webdl|webrip|bluray|blu-ray|bdrip|bdremux|remux|hdtv|dvd|sdtv)\b/i,
    /\b(?:x264|x265|h[ .-]?264|h[ .-]?265|hevc|avc|av1|vp9)\b/i,
    /\b(?:aac|flac|opus|ac3|eac3|ddp|dts(?:-hd)?)(?:[ .-]?\d(?:[ .]?\d))?\b/i,
    /\b(?:dual(?:[ .-]?audio)?|multi(?:[ .-]?audio)?|proper|repack|complete|batch)\b/i,
  ].some((pattern) => pattern.test(lower));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
