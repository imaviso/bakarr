import { Effect } from "effect";

import type { AnimeSearchResult, ScanResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { type MediaProbeShape } from "@/infra/media/probe.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import {
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
} from "@/features/operations/library-import-analysis-support.ts";
import { toAnimeSearchCandidate } from "@/features/operations/library-import.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";
import { summarizeEpisodeCoverage } from "@/domain/anime/derivations.ts";
import {
  findBestRemoteCandidate,
  enrichedEpisodeNumbers,
  roundConfidence,
} from "@/features/operations/import-path-scan-candidate-support.ts";
import {
  buildEpisodeFileMappingIndex,
  buildScannedFileLibrarySignals,
  buildScannedFileNamingPlan,
  selectEpisodeRowsForFile,
} from "@/features/operations/import-path-scan-result-support.ts";
import {
  discoverImportScanFiles,
  extractScanCandidatePaths,
} from "@/features/operations/import-path-scan-discovery-support.ts";
import { enrichImportScanFiles } from "@/features/operations/import-path-scan-enrichment-support.ts";
import {
  loadImportScanAnimeRows,
  loadImportScanNamingSettings,
  loadMappedEpisodeRows,
  loadScopedEpisodeRows,
} from "@/features/operations/import-path-scan-library-support.ts";

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
    const discovery = yield* discoverImportScanFiles({
      fs: input.fs,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      path: input.path,
    });
    const animeRows = yield* loadImportScanAnimeRows({
      ...(input.animeId === undefined ? {} : { animeId: input.animeId }),
      db: input.db,
      tryDatabasePromise: input.tryDatabasePromise,
    });
    const enrichedFiles = yield* enrichImportScanFiles({
      files: discovery.episodeFiles.map((entry) => entry.scanned),
      mediaProbe: input.mediaProbe,
    });
    const episodeNumberCandidates = [
      ...new Set(
        enrichedEpisodeNumbers(discovery.analyzed.map((entry) => entry.scanned)).filter(
          (value) => value > 0,
        ),
      ),
    ];
    const candidatePaths = extractScanCandidatePaths(
      discovery.analyzed.map((entry) => entry.scanned),
    );
    const candidateAnimeIds = animeRows.map((row) => row.id);
    const mappedEpisodeRows = yield* loadMappedEpisodeRows({
      candidateAnimeIds,
      candidatePaths,
      db: input.db,
      episodeNumberCandidates,
      tryDatabasePromise: input.tryDatabasePromise,
    });
    const mappingIndex = buildEpisodeFileMappingIndex(mappedEpisodeRows);
    const namingSettings = yield* loadImportScanNamingSettings(input.db);
    const animeRowsById = new Map(animeRows.map((row) => [row.id, row]));
    const scopedEpisodeRows = yield* loadScopedEpisodeRows({
      animeIds: animeRows.map((row) => row.id),
      db: input.db,
      episodeNumberCandidates,
      tryDatabasePromise: input.tryDatabasePromise,
    });
    const episodeRowsByAnimeEpisode = new Map(
      scopedEpisodeRows.map((row) => [`${row.animeId}:${row.number}`, row] as const),
    );

    const candidateMap = new Map<number, AnimeSearchResult>();
    const selectedAnimeRow = input.animeId ? animeRows[0] : undefined;

    if (input.animeId) {
      if (!selectedAnimeRow) {
        return yield* new OperationsInfrastructureError({
          message: `Selected anime ${input.animeId} is unavailable for import scan`,
          cause: new Error(`Anime ${input.animeId} not found in database`),
        });
      }

      candidateMap.set(selectedAnimeRow.id, yield* toAnimeSearchCandidate(selectedAnimeRow));
    } else {
      const parsedTitles = [
        ...new Set(
          discovery.episodeFiles
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
      files: enrichedFiles.map((file) => {
        const localMatch = input.animeId
          ? selectedAnimeRow
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
          targetAnime = selectedAnimeRow
            ? { id: selectedAnimeRow.id, title: selectedAnimeRow.titleRomaji }
            : undefined;
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
          ...(() => {
            const episodeRows = selectEpisodeRowsForFile(
              file,
              episodeRowsByAnimeEpisode,
              targetAnime?.id,
            );
            return episodeRows === undefined ? {} : { episodeRows };
          })(),
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
              ...(file.air_date === undefined ? {} : { airDate: file.air_date }),
              ...(file.episode_numbers === undefined
                ? {}
                : { episodeNumbers: file.episode_numbers }),
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
      skipped: discovery.skippedFiles,
      total_scanned: discovery.analyzed.length,
      truncated: discovery.truncated || undefined,
    } satisfies ScanResult;
  },
);
