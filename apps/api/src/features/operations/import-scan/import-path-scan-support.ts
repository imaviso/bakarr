import { Effect } from "effect";

import { brandMediaId, type MediaSearchResult, type ScanResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { type MediaProbeShape } from "@/infra/media/probe.ts";
import type { AniListClient } from "@/features/media/metadata/anilist.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import {
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
} from "@/features/operations/library/library-import-analysis-support.ts";
import { toAnimeSearchCandidate } from "@/features/operations/library/library-import.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";
import { summarizeEpisodeCoverage } from "@/domain/media/derivations.ts";
import {
  findBestRemoteCandidate,
  enrichedEpisodeNumbers,
  roundConfidence,
} from "@/features/operations/import-scan/import-path-scan-candidate-support.ts";
import {
  buildEpisodeFileMappingIndex,
  buildScannedFileLibrarySignals,
} from "@/features/operations/import-scan/import-path-scan-mapping-support.ts";
import { buildScannedFileNamingPlan } from "@/features/operations/import-scan/import-path-scan-naming-support.ts";
import { selectUnitRowsForFile } from "@/features/operations/import-scan/import-path-scan-unit-support.ts";
import {
  discoverImportScanFiles,
  extractScanCandidatePaths,
} from "@/features/operations/import-scan/import-path-scan-discovery-support.ts";
import { enrichImportScanFiles } from "@/features/operations/import-scan/import-path-scan-enrichment-support.ts";
import {
  loadImportScanAnimeRows,
  loadMappedEpisodeRows,
  loadScopedEpisodeRows,
} from "@/features/operations/import-scan/import-path-scan-library-support.ts";
import { currentNamingSettings } from "@/features/operations/repository/config-repository.ts";

export const scanImportPathEffect = Effect.fn("OperationsService.scanImportPathEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    mediaId?: number;
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
      ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
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
    const namingSettings = yield* currentNamingSettings(input.db);
    const animeRowsById = new Map(animeRows.map((row) => [row.id, row]));
    const scopedEpisodeRows = yield* loadScopedEpisodeRows({
      animeIds: animeRows.map((row) => row.id),
      db: input.db,
      episodeNumberCandidates,
      tryDatabasePromise: input.tryDatabasePromise,
    });
    const episodeRowsByAnimeEpisode = new Map(
      scopedEpisodeRows.map((row) => [`${row.mediaId}:${row.number}`, row] as const),
    );

    const candidateMap = new Map<number, MediaSearchResult>();
    const selectedAnimeRow = input.mediaId ? animeRows[0] : undefined;

    if (input.mediaId) {
      if (!selectedAnimeRow) {
        return yield* new OperationsInfrastructureError({
          message: `Selected media ${input.mediaId} is unavailable for import scan`,
          cause: new Error(`Media ${input.mediaId} not found in database`),
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
        const localMatch = input.mediaId
          ? selectedAnimeRow
          : findBestLocalAnimeMatch(file.parsed_title, animeRows);
        const remoteMatch =
          !input.mediaId && !localMatch
            ? findBestRemoteCandidate(file.parsed_title, [...candidateMap.values()])
            : undefined;
        const remoteCandidate = remoteMatch?.candidate;
        let matchConfidence: number | undefined;

        if (input.mediaId) {
          matchConfidence = 1;
        } else if (localMatch) {
          matchConfidence = roundConfidence(scoreAnimeRowMatch(file.parsed_title, localMatch));
        } else {
          matchConfidence = remoteMatch?.confidence;
        }
        let targetAnime: ScanResult["files"][number]["matched_media"];

        if (input.mediaId) {
          targetAnime = selectedAnimeRow
            ? { id: brandMediaId(selectedAnimeRow.id), title: selectedAnimeRow.titleRomaji }
            : undefined;
        } else if (localMatch) {
          targetAnime = { id: brandMediaId(localMatch.id), title: localMatch.titleRomaji };
        }

        let matchReason = file.match_reason;

        if (input.mediaId) {
          matchReason = "Using the selected media for this import scan";
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
            const episodeRows = selectUnitRowsForFile(
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
              ...(file.unit_numbers === undefined ? {} : { unitNumbers: file.unit_numbers }),
            }),
          unit_number: file.unit_number,
          unit_numbers: file.unit_numbers,
          unit_title: file.unit_title,
          unit_conflict: librarySignals.unit_conflict,
          existing_mapping: librarySignals.existing_mapping,
          filename: file.filename,
          group: file.group,
          match_confidence: matchConfidence,
          match_reason: matchReason,
          matched_media: localMatch
            ? { id: brandMediaId(localMatch.id), title: localMatch.titleRomaji }
            : undefined,
          needs_manual_mapping: file.needs_manual_mapping,
          parsed_title: file.parsed_title,
          quality: file.quality,
          resolution: file.resolution,
          season: file.season,
          size: file.size,
          source_identity: file.source_identity,
          source_path: file.source_path,
          suggested_candidate_id: localMatch ? brandMediaId(localMatch.id) : remoteCandidate?.id,
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
