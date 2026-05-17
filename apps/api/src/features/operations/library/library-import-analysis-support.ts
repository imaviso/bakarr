import type {
  MediaSearchResult,
  ParsedUnitIdentity,
  ScannedFile,
  SkippedFile,
} from "@packages/shared/index.ts";

import {
  scoreAnimeSearchResultMatch,
  summarizeEpisodeCoverage,
} from "@/domain/media/derivations.ts";
import { buildScannedFileMetadata } from "@/infra/scanned-file-metadata.ts";
import {
  buildPathParseContext,
  classifyMediaArtifact,
  getEpisodeNumbersFromSourceIdentity,
  getSourceIdentitySeason,
  parseFileSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/infra/media/identity/identity.ts";
import { parseResolution } from "@/features/operations/search/release-ranking.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";
import { media } from "@/db/schema.ts";

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
        unit_number: 0,
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

  const volumeNumbers = hasVolumeFileExtension(file.name)
    ? parseVolumeNumbersFromTitle(file.name)
    : [];
  const unitNumbers =
    volumeNumbers.length > 0 ? volumeNumbers : getEpisodeNumbersFromSourceIdentity(sourceIdentity);
  const season = getSourceIdentitySeason(sourceIdentity);
  const sourceIdentityDto: ParsedUnitIdentity | undefined =
    toSharedParsedEpisodeIdentity(sourceIdentity);

  const [primaryEpisode] = unitNumbers;
  const needsManualMapping =
    (volumeNumbers.length === 0 && !sourceIdentity) ||
    (volumeNumbers.length === 0 && parsed.kind === "unknown") ||
    (sourceIdentity?.scheme === "daily" && unitNumbers.length === 0);

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
        ...(unitNumbers.length === 0 ? {} : { unitNumbers }),
      }),
      unit_number: primaryEpisode ?? 0,
      unit_numbers: unitNumbers.length > 0 ? unitNumbers : undefined,
      unit_title: metadata.unit_title,
      filename: file.name,
      group,
      match_reason: describeScannedFileMatch({
        needsManualMapping,
        ...(sourceIdentityDto === undefined ? {} : { sourceIdentity: sourceIdentityDto }),
      }),
      parsed_title:
        volumeNumbers.length > 0 ? stripVolumeLabel(parsed.parsed_title) : parsed.parsed_title,
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

function stripVolumeLabel(value: string) {
  return value
    .replace(/(?:^|[\s._[(-])(?:vol(?:ume)?\.?|v)[\s._-]*\d{1,3}(?:\b|[\s._)\]-]).*/i, "")
    .replace(/(?:^|[\s._[(-])vol(?:ume)?\.?$/i, "")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasVolumeFileExtension(name: string) {
  return /\.(?:cbz|cbr|pdf|epub)$/i.test(name);
}

export function findBestLocalAnimeMatch(
  parsedTitle: string,
  animeRows: Array<typeof media.$inferSelect>,
) {
  let bestMatch: typeof media.$inferSelect | undefined;
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

export function titlesMatch(parsedTitle: string, candidate: MediaSearchResult) {
  return scoreAnimeSearchResultMatch(parsedTitle, candidate) >= 0.55;
}

export function scoreAnimeRowMatch(
  parsedTitle: string,
  row: Pick<typeof media.$inferSelect, "titleRomaji" | "titleEnglish" | "titleNative">,
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
  sourceIdentity?: ParsedUnitIdentity;
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
