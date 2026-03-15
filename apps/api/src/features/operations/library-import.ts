import { and, eq, sql } from "drizzle-orm";

import type {
  AnimeSearchResult,
  RenamePreviewItem,
  ScannedFile,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import { parseResolution } from "./release-ranking.ts";
import {
  parseEpisodeNumber,
  parseEpisodeNumbers,
  scanVideoFiles,
} from "./file-scanner.ts";
import { requireAnime } from "./repository.ts";
import { sanitizeFilename } from "../../lib/filesystem.ts";

export async function buildRenamePreview(
  db: AppDatabase,
  animeId: number,
): Promise<RenamePreviewItem[]> {
  const animeRow = await requireAnime(db, animeId);
  const rows = await db.select().from(episodes).where(
    and(eq(episodes.animeId, animeId), sql`${episodes.filePath} is not null`),
  );

  return rows.filter((row) => row.filePath).map((row) => {
    const extension = row.filePath!.includes(".")
      ? row.filePath!.slice(row.filePath!.lastIndexOf("."))
      : ".mkv";
    const filename = `${sanitizeFilename(animeRow.titleRomaji)} - ${
      String(row.number).padStart(2, "0")
    }${extension}`;
    return {
      current_path: row.filePath!,
      episode_number: row.number,
      new_filename: filename,
      new_path: `${animeRow.rootFolder.replace(/\/$/, "")}/${filename}`,
    };
  });
}

export function analyzeScannedFile(
  file: { name: string; path: string },
): ScannedFile {
  const extensionless = file.name.replace(/\.[^.]+$/, "");
  const episodeNumbers = [...parseEpisodeNumbers(file.path)];
  const titleSegment = stripEpisodeSuffix(
    extensionless.replace(/^\[[^\]]+\]\s*/g, ""),
  );
  const cleaned = titleSegment
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(
      /\[[^\]]*?(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac|dual audio|webrip|web-dl|bluray)[^\]]*\]/gi,
      "",
    )
    .replace(
      /\b(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac|dual audio|webrip|web-dl|bluray|batch|complete)\b/gi,
      "",
    )
    .replace(/(?:^|\s)[-_ ]?\d{1,3}(?:\s*[-~]\s*\d{1,3})?(?=\s|$)/g, " ")
    .replace(/s\d{1,2}e\d{1,3}(?:\s*[-~]\s*e?\d{1,3})?/gi, " ")
    .replace(
      /\b\d{1,2}x\d{1,3}(?:\s*[-~]\s*(?:\d{1,2}x)?\d{1,3})?\b/gi,
      " ",
    )
    .replace(
      /\bseason\s+\d+\s+(?:ep|e|episode)\s+\d{1,3}(?:\s*[-~]\s*(?:season\s+\d+\s+)?(?:ep|e|episode)?\s*\d{1,3})?\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const seasonMatch = extensionless.match(
    /season\s+(\d+)|(\d+)(?:st|nd|rd|th)\s+season|s(\d{1,2})[\s._-]*e\d{1,3}|(\d{1,2})x\d{1,3}/i,
  );
  const groupMatch = file.name.match(/^\[(.*?)\]/);

  return {
    episode_number: episodeNumbers[0] ?? parseEpisodeNumber(file.path) ?? 1,
    episode_numbers: episodeNumbers.length > 1 ? episodeNumbers : undefined,
    filename: file.name,
    group: groupMatch?.[1],
    parsed_title: cleaned.length > 0 ? cleaned : extensionless,
    resolution: parseResolution(extensionless),
    season: seasonMatch
      ? Number(
        seasonMatch[1] ?? seasonMatch[2] ?? seasonMatch[3] ?? seasonMatch[4],
      )
      : undefined,
    source_path: file.path,
  };
}

export function toAnimeSearchCandidate(
  row: typeof anime.$inferSelect,
): AnimeSearchResult {
  return {
    already_in_library: true,
    cover_image: row.coverImage ?? undefined,
    episode_count: row.episodeCount ?? undefined,
    format: row.format,
    id: row.id,
    status: row.status,
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  };
}

export function findBestLocalAnimeMatch(
  parsedTitle: string,
  animeRows: Array<typeof anime.$inferSelect>,
) {
  const normalizedTarget = normalizeTitle(parsedTitle);
  let bestMatch: typeof anime.$inferSelect | undefined;
  let bestScore = 0;

  for (const row of animeRows) {
    const titles = [
      row.titleRomaji,
      row.titleEnglish ?? "",
      row.titleNative ?? "",
    ]
      .filter((value) => value.length > 0);
    const score = Math.max(
      ...titles.map((title) =>
        scoreTitleMatch(normalizedTarget, normalizeTitle(title))
      ),
    );

    if (score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }

  return bestScore >= 0.55 ? bestMatch : undefined;
}

export function titlesMatch(parsedTitle: string, candidate: AnimeSearchResult) {
  const target = normalizeTitle(parsedTitle);
  const titles = [
    candidate.title.romaji,
    candidate.title.english,
    candidate.title.native,
  ].filter((value): value is string =>
    typeof value === "string" && value.length > 0
  );
  return titles.some((title) =>
    scoreTitleMatch(target, normalizeTitle(title)) >= 0.55
  );
}

export { parseEpisodeNumber, parseEpisodeNumbers, scanVideoFiles };

function stripEpisodeSuffix(value: string) {
  const patterns = [
    /^(.*?)(?:\s*[-._ ]\s*)s\d{1,2}[\s._-]*e\d{1,3}(?:[\s._-]*e?\d{1,3})*(?:\s*[-._ ]\s*.*)?$/i,
    /^(.*?)(?:\s*[-._ ]\s*)\d{1,2}x\d{1,3}(?:[\s._-](?:\d{1,2}x)?\d{1,3})*(?:\s*[-._ ]\s*.*)?$/i,
    /^(.*?)(?:\s*[-._ ]\s*)season[\s._-]*\d{1,2}[\s._-]*(?:ep|e|episode)[\s._-]*\d{1,3}(?:\s*[-._ ]\s*(?:season[\s._-]*\d{1,2}[\s._-]*)?(?:ep|e|episode)?[\s._-]*\d{1,3})*(?:\s*[-._ ]\s*.*)?$/i,
    /^(.*?)(?:\s+-\s+)\d{1,4}(?:v\d+)?(?:\s+-\s+.*|\s*(?:\[.*|\(.*|$))/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return value;
}

function normalizeTitle(value: string) {
  return romanToArabic(
    value
      .toLowerCase()
      .replace(/\((19|20)\d{2}\)/g, " ")
      .replace(/\b(?:the|season|part|cour|ova|ona|tv|movie|special)\b/g, " ")
      .replace(/\biiii?\b/g, " 4 ")
      .replace(/\biii\b/g, " 3 ")
      .replace(/\bii\b/g, " 2 ")
      .replace(/\biv\b/g, " 4 ")
      .replace(/\bvi\b/g, " 6 ")
      .replace(/\bv\b/g, " 5 ")
      .replace(/\bx\b/g, " x ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function romanToArabic(value: string) {
  return value
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\biv\b/g, "4")
    .replace(/\bvi\b/g, "6")
    .replace(/\bv\b/g, "5")
    .replace(/\bi\b/g, "1");
}

function scoreTitleMatch(left: string, right: string) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.8;
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection =
    [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}
