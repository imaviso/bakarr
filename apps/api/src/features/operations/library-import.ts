import { and, eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type {
  AnimeSearchResult,
  ParsedEpisodeIdentity,
  RenamePreviewItem,
  ScannedFile,
  SkippedFile,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import {
  buildPathParseContext,
  classifyMediaArtifact,
  getEpisodeNumbersFromSourceIdentity,
  getSourceIdentitySeason,
  parseFileSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/lib/media-identity.ts";
import { scoreAnimeSearchResultMatch, summarizeEpisodeCoverage } from "@/lib/anime-derivations.ts";
import {
  buildEpisodeFilenamePlan,
  selectNamingFormat,
} from "@/features/operations/naming-support.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { parseResolution } from "@/features/operations/release-ranking.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/lib/anime-date-utils.ts";
import { buildScannedFileMetadata } from "@/lib/scanned-file-metadata.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { currentNamingSettings } from "@/features/operations/repository/config-repository.ts";

const AnimeGenresJsonSchema = Schema.parseJson(Schema.Array(Schema.String));

const decodeAnimeGenres = Effect.fn("Operations.decodeAnimeGenres")(function* (
  value: string | null,
) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(AnimeGenresJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      (cause) =>
        new OperationsStoredDataError({
          cause,
          message: "Stored anime genres are corrupt",
        }),
    ),
  );
});

export const buildRenamePreview = Effect.fn("OperationsService.buildRenamePreview")(function* (
  db: AppDatabase,
  animeId: number,
) {
  const animeRow = yield* requireAnime(db, animeId);
  const namingSettings = yield* currentNamingSettings(db);
  const namingFormat = selectNamingFormat(animeRow, namingSettings);
  const rows = yield* tryDatabasePromise("Failed to load episodes for rename preview", () =>
    db
      .select()
      .from(episodes)
      .where(and(eq(episodes.animeId, animeId), sql`${episodes.filePath} is not null`)),
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
    const episodeNumbers = groupRows.map((r) => r.number).toSorted((a, b) => a - b);
    const [primaryEpisode] = episodeNumbers;

    if (primaryEpisode === undefined) {
      continue;
    }

    const extension = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".")) : ".mkv";
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
      missing_fields: plan.missingFields.length > 0 ? [...plan.missingFields] : undefined,
      new_filename: filename,
      new_path: `${animeRow.rootFolder.replace(/\/$/, "")}/${filename}`,
      warnings: plan.warnings.length > 0 ? [...plan.warnings] : undefined,
    });
  }

  return results;
});

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
  const context =
    rootPath && isInSubfolder ? buildPathParseContext(rootPath, file.path) : undefined;

  // Classify first to detect extras/samples
  const classification = classifyMediaArtifact(file.path, file.name, context);

  if (classification.kind === "extra" || classification.kind === "sample") {
    return {
      scanned: {
        episode_number: 0,
        filename: file.name,
        parsed_title: "",
        source_path: file.path,
        skip_reason: classification.skip_reason ?? `Detected as ${classification.kind}`,
        needs_manual_mapping: false,
      },
      skipped: {
        path: file.path,
        reason: classification.skip_reason ?? `Detected as ${classification.kind}`,
      },
    };
  }

  // Parse with canonical parser
  const parsed = parseFileSourceIdentity(file.path, context);
  const sourceIdentity = parsed.source_identity;

  // Extract episode numbers from source identity
  const episodeNumbers = getEpisodeNumbersFromSourceIdentity(sourceIdentity);
  const season = getSourceIdentitySeason(sourceIdentity);
  const sourceIdentityDto: ParsedEpisodeIdentity | undefined =
    toSharedParsedEpisodeIdentity(sourceIdentity);

  const [primaryEpisode] = episodeNumbers;
  const needsManualMapping =
    !sourceIdentity ||
    parsed.kind === "unknown" ||
    (sourceIdentity.scheme === "daily" && episodeNumbers.length === 0);

  // Fallback: extract group from filename if canonical parser didn't find one
  const group = parsed.group ?? file.name.match(/^\[(.*?)\]/)?.[1];
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
        ...(metadata.air_date === undefined ? {} : { airDate: metadata.air_date }),
        ...(episodeNumbers.length === 0 ? {} : { episodeNumbers }),
      }),
      episode_number: primaryEpisode ?? 0,
      episode_numbers: episodeNumbers.length > 0 ? episodeNumbers : undefined,
      episode_title: metadata.episode_title,
      filename: file.name,
      group,
      match_reason: describeScannedFileMatch({
        needsManualMapping,
        ...(sourceIdentityDto === undefined ? {} : { sourceIdentity: sourceIdentityDto }),
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
      warnings: metadata.warnings.length > 0 ? [...metadata.warnings] : undefined,
      needs_manual_mapping: needsManualMapping || undefined,
    },
  };
}

export const toAnimeSearchCandidate = Effect.fn("Operations.toAnimeSearchCandidate")(function* (
  row: typeof anime.$inferSelect,
) {
  return {
    already_in_library: true,
    banner_image: row.bannerImage ?? undefined,
    cover_image: row.coverImage ?? undefined,
    description: row.description ?? undefined,
    end_date: row.endDate ?? undefined,
    end_year: row.endYear ?? undefined,
    episode_count: row.episodeCount ?? undefined,
    format: row.format,
    genres: yield* decodeAnimeGenres(row.genres),
    id: row.id,
    season: deriveAnimeSeason(row.startDate),
    season_year: row.startYear ?? extractYearFromDate(row.startDate),
    start_date: row.startDate ?? undefined,
    start_year: row.startYear ?? undefined,
    status: row.status,
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  } satisfies AnimeSearchResult;
});

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

export function scoreAnimeRowMatch(
  parsedTitle: string,
  row: Pick<typeof anime.$inferSelect, "titleRomaji" | "titleEnglish" | "titleNative">,
) {
  return scoreAnimeSearchResultMatch(parsedTitle, {
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  });
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
