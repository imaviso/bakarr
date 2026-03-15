import { and, eq, sql } from "drizzle-orm";

import type {
  AnimeSearchResult,
  ParsedEpisodeIdentity,
  RenamePreviewItem,
  ScannedFile,
  SkippedFile,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import {
  buildPathParseContext,
  classifyMediaArtifact,
  parseFileSourceIdentity,
} from "../../lib/media-identity.ts";
import { renderEpisodeFilename } from "../../lib/naming.ts";
import { parseResolution } from "./release-ranking.ts";
import { currentNamingFormat, requireAnime } from "./repository.ts";

export async function buildRenamePreview(
  db: AppDatabase,
  animeId: number,
): Promise<RenamePreviewItem[]> {
  const animeRow = await requireAnime(db, animeId);
  const namingFormat = await currentNamingFormat(db);
  const rows = await db.select().from(episodes).where(
    and(eq(episodes.animeId, animeId), sql`${episodes.filePath} is not null`),
  );

  // Group rows by file path to handle multi-episode files
  const fileGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.filePath) continue;
    const existing = fileGroups.get(row.filePath) ?? [];
    existing.push(row);
    fileGroups.set(row.filePath, existing);
  }

  const results: RenamePreviewItem[] = [];
  for (const [filePath, groupRows] of fileGroups) {
    const episodeNumbers = groupRows.map((r) => r.number).sort((a, b) => a - b);
    const primaryEpisode = episodeNumbers[0];
    const extension = filePath.includes(".")
      ? filePath.slice(filePath.lastIndexOf("."))
      : ".mkv";
    const filename = renderEpisodeFilename(namingFormat, {
      title: animeRow.titleRomaji,
      episodeNumbers,
    }) + extension;
    results.push({
      current_path: filePath,
      episode_number: primaryEpisode,
      episode_numbers: episodeNumbers.length > 1 ? episodeNumbers : undefined,
      new_filename: filename,
      new_path: `${animeRow.rootFolder.replace(/\/$/, "")}/${filename}`,
    });
  }

  return results;
}

export interface AnalyzedFile {
  scanned: ScannedFile;
  skipped?: SkippedFile;
}

export function analyzeScannedFile(
  file: { name: string; path: string },
  rootPath?: string,
): AnalyzedFile {
  // Only build folder context when the file is in a subfolder of the root,
  // not when it sits directly in the scan root (where the folder name is not
  // an anime title).
  const fileDir = file.path.substring(0, file.path.lastIndexOf("/"));
  const isInSubfolder = rootPath
    ? fileDir.replace(/\/$/, "") !== rootPath.replace(/\/$/, "")
    : false;
  const context = rootPath && isInSubfolder
    ? buildPathParseContext(rootPath, file.path)
    : undefined;

  // Classify first to detect extras/samples
  const classification = classifyMediaArtifact(
    file.path,
    file.name,
    context,
  );

  if (classification.kind === "extra" || classification.kind === "sample") {
    return {
      scanned: {
        episode_number: 0,
        filename: file.name,
        parsed_title: "",
        source_path: file.path,
        skip_reason: classification.skip_reason ??
          `Detected as ${classification.kind}`,
        needs_manual_mapping: false,
      },
      skipped: {
        path: file.path,
        reason: classification.skip_reason ??
          `Detected as ${classification.kind}`,
      },
    };
  }

  // Parse with canonical parser
  const parsed = parseFileSourceIdentity(file.path, context);
  const sourceIdentity = parsed.source_identity;

  // Extract episode numbers from source identity
  let episodeNumbers: number[] = [];
  let season: number | undefined;
  let sourceIdentityDto: ParsedEpisodeIdentity | undefined;

  if (sourceIdentity) {
    sourceIdentityDto = {
      scheme: sourceIdentity.scheme,
      label: sourceIdentity.label,
    };

    if (sourceIdentity.scheme === "season") {
      season = sourceIdentity.season;
      episodeNumbers = [...sourceIdentity.episode_numbers];
      sourceIdentityDto.season = sourceIdentity.season;
      sourceIdentityDto.episode_numbers = [...sourceIdentity.episode_numbers];
    } else if (sourceIdentity.scheme === "absolute") {
      episodeNumbers = [...sourceIdentity.episode_numbers];
      sourceIdentityDto.episode_numbers = [...sourceIdentity.episode_numbers];
    } else if (sourceIdentity.scheme === "daily") {
      sourceIdentityDto.air_dates = [...sourceIdentity.air_dates];
    }
  }

  const primaryEpisode = episodeNumbers[0];
  const needsManualMapping = !sourceIdentity ||
    parsed.kind === "unknown" ||
    (sourceIdentity.scheme === "daily" && episodeNumbers.length === 0);

  // Fallback: extract group from filename if canonical parser didn't find one
  const group = parsed.group ??
    file.name.match(/^\[(.*?)\]/)?.[1];

  return {
    scanned: {
      episode_number: primaryEpisode ?? 0,
      episode_numbers: episodeNumbers.length > 0 ? episodeNumbers : undefined,
      filename: file.name,
      group,
      parsed_title: parsed.parsed_title,
      resolution: parsed.resolution ?? parseResolution(file.name),
      season,
      source_path: file.path,
      source_identity: sourceIdentityDto,
      skip_reason: parsed.skip_reason,
      needs_manual_mapping: needsManualMapping || undefined,
    },
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
