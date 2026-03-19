import { and, eq, sql } from "drizzle-orm";
import { Either, Schema } from "effect";

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
import {
  buildEpisodeFilenamePlan,
  buildScannedFileMetadata,
  selectNamingFormat,
} from "./naming-support.ts";
import { parseResolution } from "./release-ranking.ts";
import { currentNamingSettings, requireAnime } from "./repository.ts";

const AnimeGenresJsonSchema = Schema.parseJson(Schema.Array(Schema.String));

function decodeAnimeGenres(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const decoded = Schema.decodeUnknownEither(AnimeGenresJsonSchema)(value);
  return Either.isRight(decoded) ? [...decoded.right] : undefined;
}

export async function buildRenamePreview(
  db: AppDatabase,
  animeId: number,
): Promise<RenamePreviewItem[]> {
  const animeRow = await requireAnime(db, animeId);
  const namingSettings = await currentNamingSettings(db);
  const namingFormat = selectNamingFormat(animeRow, namingSettings);
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
    const plan = buildEpisodeFilenamePlan({
      animeRow,
      episodeNumbers,
      episodeRows: groupRows,
      filePath,
      namingFormat,
      preferredTitle: namingSettings.preferredTitle,
    });
    const filename = `${plan.baseName}${extension}`;
    results.push({
      current_path: filePath,
      episode_number: primaryEpisode,
      episode_numbers: episodeNumbers.length > 1 ? episodeNumbers : undefined,
      fallback_used: plan.fallbackUsed || undefined,
      format_used: plan.formatUsed,
      metadata_snapshot: plan.metadataSnapshot,
      missing_fields: plan.missingFields.length > 0
        ? [...plan.missingFields]
        : undefined,
      new_filename: filename,
      new_path: `${animeRow.rootFolder.replace(/\/$/, "")}/${filename}`,
      warnings: plan.warnings.length > 0 ? [...plan.warnings] : undefined,
    });
  }

  return results;
}

export interface AnalyzedFile {
  scanned: ScannedFile;
  skipped?: SkippedFile;
}

export function analyzeScannedFile(
  file: { name: string; path: string; size?: number },
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
  const metadata = buildScannedFileMetadata({
    filePath: file.path,
    group,
    sourceIdentity: sourceIdentityDto,
  });

  return {
    scanned: {
      air_date: metadata.air_date,
      audio_channels: metadata.audio_channels,
      audio_codec: metadata.audio_codec,
      coverage_summary: summarizeEpisodeCoverage({
        airDate: metadata.air_date,
        episodeNumbers,
      }),
      episode_number: primaryEpisode ?? 0,
      episode_numbers: episodeNumbers.length > 0 ? episodeNumbers : undefined,
      episode_title: metadata.episode_title,
      filename: file.name,
      group,
      match_reason: describeScannedFileMatch({
        needsManualMapping,
        sourceIdentity: sourceIdentityDto,
      }),
      parsed_title: parsed.parsed_title,
      quality: metadata.quality,
      resolution: parsed.resolution ?? parseResolution(file.name),
      season,
      size: file.size,
      source_path: file.path,
      source_identity: sourceIdentityDto,
      skip_reason: parsed.skip_reason,
      video_codec: metadata.video_codec,
      warnings: metadata.warnings.length > 0
        ? [...metadata.warnings]
        : undefined,
      needs_manual_mapping: needsManualMapping || undefined,
    },
  };
}

export function toAnimeSearchCandidate(
  row: typeof anime.$inferSelect,
): AnimeSearchResult {
  return {
    already_in_library: true,
    banner_image: row.bannerImage ?? undefined,
    cover_image: row.coverImage ?? undefined,
    description: row.description ?? undefined,
    end_date: row.endDate ?? undefined,
    end_year: row.endYear ?? undefined,
    episode_count: row.episodeCount ?? undefined,
    format: row.format,
    genres: decodeAnimeGenres(row.genres),
    id: row.id,
    season: deriveAnimeSeason(row.startDate),
    season_year: row.startYear ?? extractYear(row.startDate),
    start_date: row.startDate ?? undefined,
    start_year: row.startYear ?? undefined,
    status: row.status,
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  };
}

function deriveAnimeSeason(date?: string | null) {
  if (!date) {
    return undefined;
  }

  const month = Number.parseInt(date.split("-")[1] ?? "", 10);

  if (!Number.isFinite(month)) {
    return undefined;
  }

  if (month <= 2 || month === 12) return "winter" as const;
  if (month <= 5) return "spring" as const;
  if (month <= 8) return "summer" as const;
  return "fall" as const;
}

function extractYear(date?: string | null) {
  if (!date) {
    return undefined;
  }

  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

export function findBestLocalAnimeMatch(
  parsedTitle: string,
  animeRows: Array<typeof anime.$inferSelect>,
) {
  let bestMatch: typeof anime.$inferSelect | undefined;
  let bestScore = 0;

  for (const row of animeRows) {
    const score = scoreAnimeRowMatch(parsedTitle, row);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }

  return bestScore >= 0.55 ? bestMatch : undefined;
}

export function titlesMatch(parsedTitle: string, candidate: AnimeSearchResult) {
  return scoreAnimeSearchResultMatch(parsedTitle, candidate) >= 0.55;
}

export function summarizeEpisodeCoverage(input: {
  airDate?: string;
  episodeNumbers?: readonly number[];
}) {
  if (input.airDate) {
    return `Air date ${input.airDate}`;
  }

  const episodeNumbers = [...new Set(input.episodeNumbers ?? [])]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (episodeNumbers.length <= 1) {
    return undefined;
  }

  const isContiguous = episodeNumbers.every((value, index) =>
    index === 0 || value === episodeNumbers[index - 1] + 1
  );

  if (isContiguous) {
    return `Episodes ${episodeNumbers[0]}-${
      episodeNumbers[episodeNumbers.length - 1]
    }`;
  }

  return `Episodes ${episodeNumbers.join(", ")}`;
}

export function scoreAnimeSearchResultMatch(
  parsedTitle: string,
  candidate: Pick<AnimeSearchResult, "title" | "synonyms">,
) {
  const target = normalizeTitle(parsedTitle);
  const titles = [
    candidate.title.romaji,
    candidate.title.english,
    candidate.title.native,
    ...(candidate.synonyms ?? []),
  ].filter((value): value is string =>
    typeof value === "string" && value.length > 0
  );

  return titles.length === 0 ? 0 : Math.max(
    ...titles.map((title) => scoreTitleMatch(target, normalizeTitle(title))),
  );
}

export function scoreAnimeRowMatch(
  parsedTitle: string,
  row: Pick<
    typeof anime.$inferSelect,
    "titleRomaji" | "titleEnglish" | "titleNative"
  >,
) {
  return scoreAnimeSearchResultMatch(parsedTitle, {
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  });
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

function describeScannedFileMatch(input: {
  needsManualMapping: boolean;
  sourceIdentity?: ParsedEpisodeIdentity;
}) {
  if (input.needsManualMapping) {
    if (input.sourceIdentity?.scheme === "daily") {
      return "Parsed a daily air date from the filename; choose the episode mapping before import";
    }

    return "No reliable episode identity found in the filename; review this file before import";
  }

  if (!input.sourceIdentity) {
    return undefined;
  }

  switch (input.sourceIdentity.scheme) {
    case "season":
      return `Parsed ${input.sourceIdentity.label} from the filename`;
    case "absolute":
      return `Parsed episode ${input.sourceIdentity.label} from the filename`;
    case "daily":
      return `Parsed ${input.sourceIdentity.label} from the filename`;
  }
}
