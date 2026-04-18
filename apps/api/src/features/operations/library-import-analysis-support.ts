import type {
  AnimeSearchResult,
  ParsedEpisodeIdentity,
  ScannedFile,
  SkippedFile,
} from "@packages/shared/index.ts";

import { scoreAnimeSearchResultMatch, summarizeEpisodeCoverage } from "@/lib/anime-derivations.ts";
import { buildScannedFileMetadata } from "@/lib/scanned-file-metadata.ts";
import {
  buildPathParseContext,
  classifyMediaArtifact,
  getEpisodeNumbersFromSourceIdentity,
  getSourceIdentitySeason,
  parseFileSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/lib/media-identity.ts";
import { parseResolution } from "@/features/operations/release-ranking.ts";
import { anime } from "@/db/schema.ts";

export interface AnalyzedFile {
  scanned: ScannedFile;
  skipped?: SkippedFile;
}

export function analyzeScannedFile(
  file: { name: string; path: string; size?: number },
  rootPath?: string,
): AnalyzedFile {
  const fileDir = file.path.substring(0, file.path.lastIndexOf("/"));
  const isInSubfolder = rootPath
    ? fileDir.replace(/\/$/, "") !== rootPath.replace(/\/$/, "")
    : false;
  const context =
    rootPath && isInSubfolder ? buildPathParseContext(rootPath, file.path) : undefined;

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

  const parsed = parseFileSourceIdentity(file.path, context);
  const sourceIdentity = parsed.source_identity;

  const episodeNumbers = getEpisodeNumbersFromSourceIdentity(sourceIdentity);
  const season = getSourceIdentitySeason(sourceIdentity);
  const sourceIdentityDto: ParsedEpisodeIdentity | undefined =
    toSharedParsedEpisodeIdentity(sourceIdentity);

  const [primaryEpisode] = episodeNumbers;
  const needsManualMapping =
    !sourceIdentity ||
    parsed.kind === "unknown" ||
    (sourceIdentity.scheme === "daily" && episodeNumbers.length === 0);

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

  return undefined;
}
