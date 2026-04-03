import type { Quality } from "@packages/shared/index.ts";
import { parseResolutionLabel } from "@/lib/media-resolution.ts";

type QualitySource =
  | "BluRayRemux"
  | "BluRay"
  | "WebDl"
  | "WebRip"
  | "HDTV"
  | "DVD"
  | "SDTV"
  | "Unknown";

const QUALITY_ID = {
  BLURAY_2160P: 1,
  WEBDL_2160P: 2,
  BLURAY_1080P: 3,
  WEBDL_1080P: 4,
  BLURAY_720P: 5,
  WEBDL_720P: 6,
  HDTV_1080P: 7,
  HDTV_720P: 8,
  DVD_576P: 9,
  SDTV_480P: 10,
  BLURAY_2160P_REMUX: 11,
  BLURAY_1080P_REMUX: 12,
  WEBRIP_2160P: 13,
  WEBRIP_1080P: 14,
  WEBRIP_720P: 15,
  UNKNOWN: 99,
} as const;

const QUALITY_DEFS: ReadonlyArray<Quality & { readonly sourceKind: QualitySource }> = [
  makeQuality(QUALITY_ID.BLURAY_2160P_REMUX, "BluRay 2160p Remux", "remux", 2160, 1, "BluRayRemux"),
  makeQuality(QUALITY_ID.BLURAY_2160P, "BluRay 2160p", "bluray", 2160, 2, "BluRay"),
  makeQuality(QUALITY_ID.WEBDL_2160P, "WEB-DL 2160p", "web", 2160, 3, "WebDl"),
  makeQuality(QUALITY_ID.WEBRIP_2160P, "WEBRip 2160p", "webrip", 2160, 4, "WebRip"),
  makeQuality(QUALITY_ID.BLURAY_1080P_REMUX, "BluRay 1080p Remux", "remux", 1080, 5, "BluRayRemux"),
  makeQuality(QUALITY_ID.BLURAY_1080P, "BluRay 1080p", "bluray", 1080, 6, "BluRay"),
  makeQuality(QUALITY_ID.WEBDL_1080P, "WEB-DL 1080p", "web", 1080, 7, "WebDl"),
  makeQuality(QUALITY_ID.WEBRIP_1080P, "WEBRip 1080p", "webrip", 1080, 8, "WebRip"),
  makeQuality(QUALITY_ID.BLURAY_720P, "BluRay 720p", "bluray", 720, 9, "BluRay"),
  makeQuality(QUALITY_ID.WEBDL_720P, "WEB-DL 720p", "web", 720, 10, "WebDl"),
  makeQuality(QUALITY_ID.WEBRIP_720P, "WEBRip 720p", "webrip", 720, 11, "WebRip"),
  makeQuality(QUALITY_ID.HDTV_1080P, "HDTV 1080p", "hdtv", 1080, 12, "HDTV"),
  makeQuality(QUALITY_ID.HDTV_720P, "HDTV 720p", "hdtv", 720, 13, "HDTV"),
  makeQuality(QUALITY_ID.DVD_576P, "DVD 576p", "dvd", 576, 14, "DVD"),
  makeQuality(QUALITY_ID.SDTV_480P, "SDTV 480p", "sdtv", 480, 15, "SDTV"),
  makeQuality(QUALITY_ID.UNKNOWN, "Unknown", "unknown", 0, 99, "Unknown"),
];

export function parseResolution(title: string): string | undefined {
  return parseResolutionLabel(title);
}

export function parseQualityFromTitle(title: string): Quality {
  const lower = title.toLowerCase();
  const parsedResolution = parseResolution(title);
  const source = inferSource(lower);

  if (!parsedResolution && source === "Unknown") {
    return stripSourceKind(QUALITY_DEFS[QUALITY_DEFS.length - 1]);
  }

  const resolution = parsedResolution ? Number(parsedResolution.replace("p", "")) : 1080;
  const normalizedSource = source === "Unknown" ? "WebDl" : source;

  const exact = QUALITY_DEFS.find(
    (quality) => quality.sourceKind === normalizedSource && quality.resolution === resolution,
  );
  if (exact) {
    return stripSourceKind(exact);
  }

  return stripSourceKind(QUALITY_DEFS[QUALITY_DEFS.length - 1]);
}

export function cutoffQuality(label: string): Quality {
  const parsed = parseQualityFromTitle(label);
  if (parsed.id !== QUALITY_ID.UNKNOWN) {
    return parsed;
  }

  const parsedResolution = parseResolution(label);
  const resolution = parsedResolution ? Number(parsedResolution.replace("p", "")) : 1080;
  const exact = QUALITY_DEFS.find(
    (quality) => quality.resolution === resolution && quality.sourceKind === "BluRay",
  );
  return stripSourceKind(exact ?? QUALITY_DEFS[5]);
}

export function hasSourceMarkers(title: string): boolean {
  const lower = title.toLowerCase();
  return SOURCE_MARKERS.some((marker) => lower.includes(marker));
}

function inferSource(lower: string): QualitySource {
  if (lower.includes("remux")) return "BluRayRemux";
  if (
    lower.includes("bluray") ||
    lower.includes("blu-ray") ||
    lower.includes("bdremux") ||
    lower.includes("bdrip") ||
    lower.includes("bdmv") ||
    /(?:^|[\s._\-[\]()])bd(?:$|[\s._\-[\]()])/i.test(lower)
  )
    return "BluRay";
  if (lower.includes("webrip")) return "WebRip";
  if (
    lower.includes("amzn") ||
    lower.includes("amazon") ||
    /\bcr\b/i.test(lower) ||
    lower.includes("crunchyroll") ||
    lower.includes("dsnp") ||
    lower.includes("disney") ||
    /\bnf\b/i.test(lower) ||
    lower.includes("netflix") ||
    lower.includes("hmax") ||
    lower.includes("hulu") ||
    lower.includes("web")
  )
    return "WebDl";
  if (lower.includes("hdtv")) return "HDTV";
  if (lower.includes("dvd")) return "DVD";
  if (lower.includes("sdtv")) return "SDTV";
  return "Unknown";
}

function stripSourceKind(quality: Quality & { readonly sourceKind?: QualitySource }): Quality {
  return {
    id: quality.id,
    name: quality.name,
    rank: quality.rank,
    resolution: quality.resolution,
    source: quality.source,
  };
}

function makeQuality(
  id: number,
  name: string,
  source: string,
  resolution: number,
  rank: number,
  sourceKind: QualitySource,
) {
  return {
    id,
    name,
    rank,
    resolution,
    source,
    sourceKind,
  } as const;
}

const SOURCE_MARKERS = [
  "remux",
  "bluray",
  "blu-ray",
  "bdremux",
  "bdmv",
  "bdrip",
  "webrip",
  "amzn",
  "amazon",
  "crunchyroll",
  "dsnp",
  "disney",
  "netflix",
  "hmax",
  "hulu",
  "web-dl",
  "webdl",
  "hdtv",
  "dvd",
  "sdtv",
];
