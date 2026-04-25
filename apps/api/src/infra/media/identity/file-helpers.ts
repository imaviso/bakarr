import { parseResolutionLabel } from "@/infra/media/resolution.ts";
import type { ParsedMediaFile, PathParseContext } from "@/infra/media/identity/types.ts";

const EXTRA_KEYWORDS = new Set([
  "extras",
  "extra",
  "featurette",
  "featurettes",
  "trailer",
  "trailers",
  "bonus",
  "bonus features",
  "special feature",
  "special features",
  "deleted scene",
  "deleted scenes",
]);

const EXTRA_FOLDER_NAMES = new Set([
  "extras",
  "extra",
  "featurettes",
  "trailers",
  "bonus",
  "bonus features",
  "special features",
  "deleted scenes",
]);

const SAMPLE_KEYWORDS = ["sample", "samples"];

const SPECIALS_FOLDER_NAMES = new Set(["specials", "special", "season 0", "season 00", "s00"]);

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".mov", ".webm"]);

const METADATA_TAG_PATTERNS: readonly RegExp[] = [
  /\b\d{3,4}p\b/i,
  /\b\d{3,4}x\d{3,4}\b/i,
  /\bv\d+\b/i,
  /\b(?:web(?:[ .-]?dl)?|webdl|webrip|web-?rip|web-?dl)\b/i,
  /\b(?:bluray|blu-ray|bd(?:remux|rip|mux)?|remux|hdtv|dvd|sdtv)\b/i,
  /\b(?:x264|x265|h[ .-]?264|h[ .-]?265|hevc|avc|av1|vp9|vp10|mpeg-?2?|vc-?1?)\b/i,
  /\b(?:aac|flac|opus|ac3|e-?ac3|ddp|dd[ .+]?\d(?:[ .]?\d)?)\b/i,
  /\b(?:true?hd|dts(?:-?hd)?(?:-?ma)?|pcm|l?pcm)\b/i,
  /\b(?:dual(?:[ .-]?audio)?|multi(?:[ .-]?audio)?|proper|repack|complete|batch)\b/i,
];

export function classifyMediaArtifact(
  path: string,
  name: string,
  _context?: PathParseContext,
): ParsedMediaFile {
  const lowerName = name.toLowerCase();
  const extensionless = stripExtension(lowerName);

  const ext = getExtension(name);
  if (ext && !VIDEO_EXTENSIONS.has(ext)) {
    return {
      kind: "unknown",
      parsed_title: name,
      skip_reason: `Not a video file: ${ext}`,
    };
  }

  for (const keyword of SAMPLE_KEYWORDS) {
    if (
      extensionless === keyword ||
      extensionless.startsWith(`${keyword}-`) ||
      extensionless.startsWith(`${keyword}_`) ||
      extensionless.startsWith(`${keyword}.`)
    ) {
      return {
        kind: "sample",
        parsed_title: name,
        skip_reason: `Sample file: matches "${keyword}" pattern`,
      };
    }
  }

  for (const keyword of EXTRA_KEYWORDS) {
    if (extensionless === keyword) {
      return {
        kind: "extra",
        parsed_title: name,
        skip_reason: `Extra content: "${keyword}"`,
      };
    }
  }

  const folders = path.split("/").slice(0, -1);
  for (const folder of folders) {
    const lowerFolder = folder.toLowerCase().trim();
    if (EXTRA_FOLDER_NAMES.has(lowerFolder)) {
      return {
        kind: "extra",
        parsed_title: name,
        skip_reason: `Inside extras folder: "${folder}"`,
      };
    }
    if (SAMPLE_KEYWORDS.includes(lowerFolder)) {
      return {
        kind: "sample",
        parsed_title: name,
        skip_reason: `Inside sample folder: "${folder}"`,
      };
    }
  }

  return {
    kind: "episode",
    parsed_title: name,
  };
}

export function buildPathParseContext(rootPath: string, fullPath: string): PathParseContext {
  const normalizedRoot = rootPath.replace(/\/+$/, "");
  const normalizedFull = fullPath.replace(/\/+$/, "");

  const relative = normalizedFull.startsWith(normalizedRoot + "/")
    ? normalizedFull.slice(normalizedRoot.length + 1)
    : normalizedFull;

  const segments = relative.split("/");
  const folders = segments.slice(0, -1);

  const context: PathParseContext = {};

  const rootLeaf = normalizedRoot.split("/").pop();
  if (rootLeaf) {
    context.entry_folder_title = rootLeaf;
  }

  for (const folder of folders) {
    const lower = folder.toLowerCase().trim();

    if (SPECIALS_FOLDER_NAMES.has(lower)) {
      context.is_specials_folder = true;
      context.season_hint = 0;
      continue;
    }

    const seasonMatch = folder.match(/^(?:season\s+(\d{1,2})|s(\d{1,2}))$/i);
    if (seasonMatch) {
      const num = Number(seasonMatch[1] ?? seasonMatch[2]);
      if (num === 0) {
        context.is_specials_folder = true;
        context.season_hint = 0;
      } else {
        context.season_hint = num;
      }
      continue;
    }

    const sequelHint = extractSequelHint(folder);
    if (sequelHint) {
      context.sequel_hint = sequelHint;
    }

    if (!seasonMatch && !SPECIALS_FOLDER_NAMES.has(lower)) {
      context.entry_folder_title = folder;
    }
  }

  return context;
}

export function extractTitleBeforeIdentity(value: string, label: string): string {
  let cleaned = value.replace(/^\[[^\]]+\]\s*/g, "");

  const labelEscaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = new RegExp(`[\\s._-]+(?:${labelEscaped})(?:[\\s._-]|$)`, "i");
  const match = cleaned.match(labelPattern);
  if (match?.index !== undefined) {
    cleaned = cleaned.slice(0, match.index);
  }

  cleaned = cleaned
    .replace(/[\s._-]+s\d{1,2}[\s._-]*e\d{1,4}(?:[\s._-]*e?\d{1,4})*.*/i, "")
    .replace(/[\s._-]+\d{1,2}x\d{1,3}.*/i, "")
    .replace(/[\s._-]+season[\s._-]*\d+[\s._-]*(?:ep|e|episode)[\s._-]*\d+.*/i, "")
    .replace(/[\s._-]+season[\s._-]*\d+[\s._-]+(?:-[\s._-]*)?\d+.*/i, "")
    .replace(/[\s._-]+\d{4}[\s._-]\d{2}[\s._-]\d{2}.*/, "");

  cleaned = cleaned
    .replace(/\[[^\]]*?(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac)[^\]]*\]/gi, "")
    .replace(
      /\b(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac|dual audio|webrip|web-dl|bluray|batch|complete)\b/gi,
      "",
    )
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = choosePreferredTitleAlias(cleaned);

  return cleaned;
}

export function extractTitleBeforeNumber(value: string): string {
  let cleaned = value.replace(/^\[[^\]]+\]\s*/g, "");

  cleaned = cleaned
    .replace(/[\s._-]+\d{1,4}(?:v\d+)?(?:[\s._\-[(].*)?$/, "")
    .replace(/\[[^\]]*?(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac)[^\]]*\]/gi, "")
    .replace(
      /\b(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac|dual audio|webrip|web-dl|bluray|batch|complete)\b/gi,
      "",
    )
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = choosePreferredTitleAlias(cleaned);

  return cleaned;
}

export function extractGroup(value: string): string | undefined {
  const extensionless = stripExtension(value);
  const prefixMatch = extensionless.match(/^\[(.*?)\]/);
  const prefixGroup = prefixMatch?.[1]?.trim();

  if (prefixGroup && !looksLikeMetadataTag(prefixGroup)) {
    return prefixGroup;
  }

  const bracketGroups = [...extensionless.matchAll(/\[(.*?)\]/g)]
    .map((match) => match[1]?.trim())
    .filter((match): match is string => Boolean(match));

  for (let index = bracketGroups.length - 1; index >= 0; index -= 1) {
    const candidate = bracketGroups[index];
    if (!candidate) {
      continue;
    }

    if (!looksLikeMetadataTag(candidate)) {
      return candidate;
    }
  }

  const suffixMatch = extensionless.match(/-([A-Za-z0-9][A-Za-z0-9+_.&']*)$/);
  const suffixGroup = suffixMatch?.[1]?.trim();

  if (suffixGroup && /[A-Za-z]/.test(suffixGroup) && !looksLikeMetadataTag(suffixGroup)) {
    return suffixGroup;
  }

  return undefined;
}

export function extractResolution(value: string): string | undefined {
  return parseResolutionLabel(value);
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function extractSequelHint(folderName: string): string | undefined {
  const lower = folderName.toLowerCase().trim();

  const romanMatch = folderName.match(/\b(II|III|IV|V|VI)$/i);
  const romanNumeral = romanMatch?.[1];
  if (romanNumeral) return romanNumeral.toUpperCase();

  const ordinalMatch = lower.match(/(\d+)(?:st|nd|rd|th)\s+season/);
  if (ordinalMatch) return `Season ${ordinalMatch[1]}`;

  const seasonMatch = lower.match(/season\s+(\d+)/);
  if (seasonMatch && Number(seasonMatch[1]) > 1) {
    return `Season ${seasonMatch[1]}`;
  }

  const partMatch = lower.match(/(?:part|cour)\s+(\d+)/);
  if (partMatch && Number(partMatch[1]) > 1) {
    return `Part ${partMatch[1]}`;
  }

  return undefined;
}

function looksLikeMetadataTag(value: string): boolean {
  const lower = value.trim().toLowerCase();

  if (lower.length === 0) {
    return true;
  }

  return METADATA_TAG_PATTERNS.some((pattern) => pattern.test(lower));
}

function choosePreferredTitleAlias(value: string): string {
  const aliases = value
    .split(/[/|]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (aliases.length <= 1) {
    return value;
  }

  const latinAlias = aliases.find((alias) => /[a-z]/i.test(alias));
  const base = latinAlias ?? aliases[0];
  if (!base) {
    return value;
  }

  const mixedAlias = extractLatinAliasFromMixedTitle(base);
  return mixedAlias ?? base;
}

function extractLatinAliasFromMixedTitle(value: string): string | undefined {
  if (!/[a-z]/i.test(value) || !/\p{Script=Han}/u.test(value)) {
    return undefined;
  }

  const headLatin = value.match(/^([A-Za-z][A-Za-z0-9 '&:;,.!?-]{2,})\s+\p{Script=Han}/u);
  if (headLatin?.[1]) {
    return headLatin[1].trim();
  }

  const chunks = value
    .split(/[_|/\u00B7-]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const latinChunk = chunks.find((part) => /[a-z]/i.test(part) && !/\p{Script=Han}/u.test(part));
  if (latinChunk) {
    return latinChunk;
  }

  const tailLatin = value.match(/([A-Za-z][A-Za-z0-9 '&:;,.!?-]{2,})$/);
  return tailLatin?.[1]?.trim();
}

function getExtension(filename: string): string | undefined {
  const match = filename.match(/(\.[^.]+)$/);
  return match?.[1]?.toLowerCase();
}
