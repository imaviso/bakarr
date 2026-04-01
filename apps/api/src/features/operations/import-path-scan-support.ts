import { and, eq, inArray, or } from "drizzle-orm";
import { Effect, Stream } from "effect";

import type {
  AnimeSearchResult,
  FileEpisodeMapping,
  PreferredTitle,
  ScannedFile,
  ScanResult,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import {
  type MediaProbeShape,
  mergeProbedMediaMetadata,
  shouldProbeMediaMetadata,
} from "@/lib/media-probe.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import { OperationsPathError } from "@/features/operations/errors.ts";
import { scanVideoFilesStream } from "@/features/operations/file-scanner.ts";
import { resolveImportScanLimit } from "@/features/operations/import-path-scan-policy.ts";
import {
  analyzeScannedFile,
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
  titlesMatch,
  toAnimeSearchCandidate,
} from "@/features/operations/library-import.ts";
import { buildEpisodeFilenamePlan } from "@/features/operations/naming-support.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { currentNamingSettings } from "@/features/operations/repository/config-repository.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import { scoreAnimeSearchResultMatch, summarizeEpisodeCoverage } from "@/lib/anime-derivations.ts";

export const scanImportPathEffect = Effect.fn("OperationsService.scanImportPathEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeId?: number;
    db: AppDatabase;
    fs: FileSystemShape;
    limit?: number;
    mediaProbe: MediaProbeShape;
    path: string;
    tryDatabasePromise: TryDatabasePromise;
  }) {
    const canonicalPath = yield* input.fs.realPath(input.path).pipe(
      Effect.mapError(
        () =>
          new OperationsPathError({
            message: `Import path is inaccessible: ${input.path}`,
          }),
      ),
    );

    const limit = resolveImportScanLimit(input.limit);
    const scannedFiles = Array.from(
      yield* scanVideoFilesStream(input.fs, canonicalPath).pipe(
        Stream.take(limit + 1),
        Stream.runCollect,
        Effect.mapError(
          () =>
            new OperationsPathError({
              message: `Import path is inaccessible: ${canonicalPath}`,
            }),
        ),
      ),
    );
    const truncated = scannedFiles.length > limit;
    const files = (truncated ? scannedFiles.slice(0, limit) : scannedFiles).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    const animeRows = input.animeId
      ? [yield* requireAnime(input.db, input.animeId!)]
      : yield* input.tryDatabasePromise("Failed to scan import path", () =>
          input.db.select().from(anime),
        );
    const analyzed = files.map((file) => analyzeScannedFile(file, canonicalPath));
    const episodeFiles = analyzed.filter((entry) => !entry.skipped);
    const skippedFiles = analyzed.filter((entry) => entry.skipped).map((entry) => entry.skipped!);
    const enrichScannedImportFile = Effect.fn("OperationsService.enrichScannedImportFile")(
      function* (file: ScannedFile) {
        if (!shouldProbeMediaMetadata(file)) {
          return file;
        }

        const probeResult = yield* input.mediaProbe.probeVideoFile(file.source_path);
        return mergeProbedMediaMetadata(
          file,
          probeResult._tag === "MediaProbeMetadataFound" ? probeResult.metadata : undefined,
        );
      },
    );
    const enrichedFiles = yield* Effect.forEach(
      episodeFiles.map((entry) => entry.scanned),
      enrichScannedImportFile,
      { concurrency: 4 },
    );
    const episodeNumberCandidates = [
      ...new Set(
        enrichedEpisodeNumbers(analyzed.map((entry) => entry.scanned)).filter((value) => value > 0),
      ),
    ];
    const candidatePaths = [
      ...new Set(analyzed.map((entry) => entry.scanned.source_path).filter((value) => value.length > 0)),
    ];
    const candidateAnimeIds = animeRows.map((row) => row.id);
    const mappedEpisodeRows =
      candidatePaths.length > 0 || (candidateAnimeIds.length > 0 && episodeNumberCandidates.length > 0)
        ? yield* input.tryDatabasePromise("Failed to scan import path", () => {
            const byPath = candidatePaths.length > 0
              ? inArray(episodes.filePath, candidatePaths)
              : undefined;
            const byAnimeEpisode =
              candidateAnimeIds.length > 0 && episodeNumberCandidates.length > 0
                ? and(
                    inArray(episodes.animeId, candidateAnimeIds),
                    inArray(episodes.number, episodeNumberCandidates),
                  )
                : undefined;
            const whereClause =
              byPath && byAnimeEpisode
                ? or(byPath, byAnimeEpisode)
                : byPath
                  ? byPath
                  : byAnimeEpisode;

            const query = input.db
              .select({
                anime_id: episodes.animeId,
                anime_title: anime.titleRomaji,
                episode_number: episodes.number,
                file_path: episodes.filePath,
              })
              .from(episodes)
              .innerJoin(anime, eq(episodes.animeId, anime.id));

            return whereClause ? query.where(whereClause) : Promise.resolve([]);
          })
        : [];
    const mappingIndex = buildEpisodeFileMappingIndex(mappedEpisodeRows);
    const namingSettings = yield* currentNamingSettings(input.db);
    const animeRowsById = new Map(animeRows.map((row) => [row.id, row]));
    const scopedEpisodeRows =
      animeRows.length > 0 && episodeNumberCandidates.length > 0
        ? yield* input.tryDatabasePromise("Failed to scan import path", () =>
            input.db
              .select({
                aired: episodes.aired,
                animeId: episodes.animeId,
                number: episodes.number,
                title: episodes.title,
              })
              .from(episodes)
              .where(
                and(
                  inArray(
                    episodes.animeId,
                    animeRows.map((row) => row.id),
                  ),
                  inArray(episodes.number, episodeNumberCandidates),
                ),
              ),
          )
        : [];
    const episodeRowsByAnimeEpisode = new Map(
      scopedEpisodeRows.map((row) => [`${row.animeId}:${row.number}`, row] as const),
    );

    const candidateMap = new Map<number, AnimeSearchResult>();

    if (input.animeId) {
      const [row] = animeRows;
      candidateMap.set(row.id, yield* toAnimeSearchCandidate(row));
    } else {
      const parsedTitles = [
        ...new Set(
          episodeFiles
            .map((entry) => entry.scanned.parsed_title)
            .filter((value) => value.length > 0),
        ),
      ].slice(0, 8);

      for (const parsedTitle of parsedTitles) {
        const remoteCandidates = yield* input.aniList.searchAnimeMetadata(parsedTitle);

        for (const candidate of remoteCandidates.slice(0, 5)) {
          candidateMap.set(candidate.id, candidate);
        }
      }
    }

    for (const row of animeRows) {
      candidateMap.set(row.id, yield* toAnimeSearchCandidate(row));
    }

    return {
      candidates: [...candidateMap.values()],
      files: episodeFiles.map((_entry, index) => {
        const file = enrichedFiles[index]!;
        const localMatch = input.animeId
          ? animeRows[0]
          : findBestLocalAnimeMatch(file.parsed_title, animeRows);
        const remoteMatch =
          !input.animeId && !localMatch
            ? findBestRemoteCandidate(file.parsed_title, [...candidateMap.values()])
            : undefined;
        const remoteCandidate = remoteMatch?.candidate;
        let matchConfidence: number | undefined;

        if (input.animeId) {
          matchConfidence = 1;
        } else if (localMatch) {
          matchConfidence = roundConfidence(scoreAnimeRowMatch(file.parsed_title, localMatch));
        } else {
          matchConfidence = remoteMatch?.confidence;
        }
        let targetAnime: { id: number; title: string } | undefined;

        if (input.animeId) {
          targetAnime = { id: animeRows[0].id, title: animeRows[0].titleRomaji };
        } else if (localMatch) {
          targetAnime = { id: localMatch.id, title: localMatch.titleRomaji };
        }

        let matchReason = file.match_reason;

        if (input.animeId) {
          matchReason = "Using the selected anime for this import scan";
        } else if (localMatch) {
          matchReason = `Matched a library title to the parsed filename title ${JSON.stringify(file.parsed_title)}`;
        } else if (remoteCandidate) {
          matchReason = `Matched an AniList result to the parsed filename title ${JSON.stringify(file.parsed_title)}`;
        }
        const namingAnimeRow = targetAnime ? animeRowsById.get(targetAnime.id) : undefined;
        const librarySignals = buildScannedFileLibrarySignals({
          file,
          mappingIndex,
          targetAnime,
        });
        const namingPlan = buildScannedFileNamingPlan({
          animeRow: namingAnimeRow,
          episodeRows: selectEpisodeRowsForFile(file, episodeRowsByAnimeEpisode, targetAnime?.id),
          file,
          namingSettings,
        });

        return {
          air_date: file.air_date,
          audio_channels: file.audio_channels,
          audio_codec: file.audio_codec,
          coverage_summary:
            file.coverage_summary ??
            summarizeEpisodeCoverage({
              airDate: file.air_date,
              episodeNumbers: file.episode_numbers,
            }),
          episode_number: file.episode_number,
          episode_numbers: file.episode_numbers,
          episode_title: file.episode_title,
          episode_conflict: librarySignals.episode_conflict,
          existing_mapping: librarySignals.existing_mapping,
          filename: file.filename,
          group: file.group,
          match_confidence: matchConfidence,
          match_reason: matchReason,
          matched_anime: localMatch
            ? { id: localMatch.id, title: localMatch.titleRomaji }
            : undefined,
          needs_manual_mapping: file.needs_manual_mapping,
          parsed_title: file.parsed_title,
          quality: file.quality,
          resolution: file.resolution,
          season: file.season,
          size: file.size,
          source_identity: file.source_identity,
          source_path: file.source_path,
          suggested_candidate_id: localMatch?.id ?? remoteCandidate?.id,
          naming_fallback_used: namingPlan.naming_fallback_used,
          naming_filename: namingPlan.naming_filename,
          naming_format_used: namingPlan.naming_format_used,
          naming_metadata_snapshot: namingPlan.naming_metadata_snapshot,
          naming_missing_fields: namingPlan.naming_missing_fields,
          naming_warnings: namingPlan.naming_warnings,
          video_codec: file.video_codec,
          warnings: file.warnings,
        };
      }),
      skipped: skippedFiles,
      total_scanned: analyzed.length,
      truncated: truncated || undefined,
    } satisfies ScanResult;
  },
);

function findBestRemoteCandidate(parsedTitle: string, candidates: readonly AnimeSearchResult[]) {
  let bestCandidate: AnimeSearchResult | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (candidate.already_in_library || !titlesMatch(parsedTitle, candidate)) {
      continue;
    }

    const score = scoreAnimeSearchResultMatch(parsedTitle, candidate);
    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate
    ? { candidate: bestCandidate, confidence: roundConfidence(bestScore) }
    : undefined;
}

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}

function enrichedEpisodeNumbers(
  files: readonly Pick<ScannedFile, "episode_number" | "episode_numbers">[],
) {
  return files.flatMap((file) => {
    if (file.episode_numbers?.length) {
      return file.episode_numbers;
    }

    return file.episode_number > 0 ? [file.episode_number] : [];
  });
}

export function buildScannedFileNamingPlan(input: {
  animeRow?: {
    endDate?: string | null;
    endYear?: number | null;
    format: string;
    rootFolder?: string;
    startDate?: string | null;
    startYear?: number | null;
    titleEnglish?: string | null;
    titleNative?: string | null;
    titleRomaji: string;
  };
  episodeRows?: readonly { aired?: string | null; title?: string | null }[];
  file: Pick<
    ScannedFile,
    | "air_date"
    | "audio_channels"
    | "audio_codec"
    | "episode_number"
    | "episode_numbers"
    | "episode_title"
    | "group"
    | "quality"
    | "resolution"
    | "season"
    | "source_path"
    | "source_identity"
    | "video_codec"
  >;
  namingSettings: {
    movieNamingFormat: string;
    namingFormat: string;
    preferredTitle: PreferredTitle;
  };
}) {
  if (!input.animeRow) {
    return {};
  }

  const episodeNumbers = toEpisodeNumbers(input.file);

  if (episodeNumbers.length === 0) {
    return {};
  }

  const plan = buildEpisodeFilenamePlan({
    animeRow: input.animeRow,
    downloadSourceMetadata: {
      air_date: input.file.air_date,
      audio_channels: input.file.audio_channels,
      audio_codec: input.file.audio_codec,
      episode_title: input.file.episode_title,
      group: input.file.group,
      quality: input.file.quality,
      resolution: input.file.resolution,
      source_identity: input.file.source_identity,
      video_codec: input.file.video_codec,
    },
    episodeNumbers,
    episodeRows: input.episodeRows,
    filePath: input.file.source_path,
    localMediaMetadata: {
      audio_channels: input.file.audio_channels,
      audio_codec: input.file.audio_codec,
      resolution: input.file.resolution,
      video_codec: input.file.video_codec,
    },
    namingFormat:
      input.animeRow.format === "MOVIE"
        ? input.namingSettings.movieNamingFormat
        : input.namingSettings.namingFormat,
    preferredTitle: input.namingSettings.preferredTitle,
    season: input.file.season,
  });

  return {
    naming_filename: `${plan.baseName}${extensionFromPath(input.file.source_path)}`,
    naming_fallback_used: plan.fallbackUsed || undefined,
    naming_format_used: plan.formatUsed,
    naming_metadata_snapshot: plan.metadataSnapshot,
    naming_missing_fields: plan.missingFields.length > 0 ? [...plan.missingFields] : undefined,
    naming_warnings: plan.warnings.length > 0 ? [...plan.warnings] : undefined,
  } satisfies Pick<
    ScannedFile,
    | "naming_fallback_used"
    | "naming_filename"
    | "naming_format_used"
    | "naming_metadata_snapshot"
    | "naming_missing_fields"
    | "naming_warnings"
  >;
}

function extensionFromPath(path: string) {
  return path.includes(".") ? path.slice(path.lastIndexOf(".")) : ".mkv";
}

function selectEpisodeRowsForFile(
  file: Pick<ScannedFile, "episode_number" | "episode_numbers">,
  rowsByAnimeEpisode: Map<
    string,
    {
      aired?: string | null;
      animeId: number;
      number: number;
      title?: string | null;
    }
  >,
  animeId?: number,
) {
  if (!animeId) {
    return undefined;
  }

  const episodeNumbers = toEpisodeNumbers(file);

  return episodeNumbers.flatMap((episodeNumber) => {
    const row = rowsByAnimeEpisode.get(`${animeId}:${episodeNumber}`);
    return row ? [{ aired: row.aired, title: row.title }] : [];
  });
}

type EpisodeFileMappingRow = {
  anime_id: number;
  anime_title: string;
  episode_number: number;
  file_path: string | null;
};

type EpisodeFileMappingIndex = {
  byAnimeEpisode: Map<string, EpisodeFileMappingRow>;
  byPath: Map<string, FileEpisodeMapping>;
};

export function buildEpisodeFileMappingIndex(
  rows: readonly EpisodeFileMappingRow[],
): EpisodeFileMappingIndex {
  const byAnimeEpisode = new Map<string, EpisodeFileMappingRow>();
  const byPath = new Map<string, FileEpisodeMapping>();

  for (const row of rows) {
    if (!row.file_path) {
      continue;
    }

    byAnimeEpisode.set(`${row.anime_id}:${row.episode_number}`, row);

    const existing = byPath.get(row.file_path);
    if (existing) {
      const episodeNumbers = new Set([...(existing.episode_numbers ?? []), row.episode_number]);
      byPath.set(row.file_path, {
        ...existing,
        episode_numbers: [...episodeNumbers].sort((left, right) => left - right),
      });
      continue;
    }

    byPath.set(row.file_path, {
      anime_id: row.anime_id,
      anime_title: row.anime_title,
      episode_numbers: [row.episode_number],
      file_path: row.file_path,
    });
  }

  return { byAnimeEpisode, byPath };
}

export function buildScannedFileLibrarySignals(input: {
  file: Pick<ScannedFile, "episode_number" | "episode_numbers" | "source_path">;
  mappingIndex: EpisodeFileMappingIndex;
  targetAnime?: { id: number; title: string };
}) {
  const existing_mapping = input.mappingIndex.byPath.get(input.file.source_path);
  const episodeNumbers = toEpisodeNumbers(input.file);
  const { targetAnime } = input;

  if (!targetAnime || episodeNumbers.length === 0) {
    return { existing_mapping };
  }

  const conflicts = episodeNumbers.flatMap((episodeNumber) => {
    const existing = input.mappingIndex.byAnimeEpisode.get(`${targetAnime.id}:${episodeNumber}`);

    if (!existing || existing.file_path === input.file.source_path) {
      return [];
    }

    return [existing];
  });

  if (conflicts.length === 0) {
    return { existing_mapping };
  }

  const episode_conflict: FileEpisodeMapping = {
    anime_id: targetAnime.id,
    anime_title: targetAnime.title,
    episode_numbers: [...new Set(conflicts.map((row) => row.episode_number))].sort(
      (left, right) => left - right,
    ),
    file_path: conflicts[0]?.file_path ?? undefined,
  };

  return {
    episode_conflict,
    existing_mapping,
  };
}

function toEpisodeNumbers(file: Pick<ScannedFile, "episode_number" | "episode_numbers">) {
  if (file.episode_numbers?.length) {
    return file.episode_numbers;
  }

  return file.episode_number > 0 ? [file.episode_number] : [];
}
