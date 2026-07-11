import { Effect } from "effect";

import { brandMediaId, type MediaSearchResult, type ScanResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { AppDrizzleDatabase, DatabaseError } from "@/db/database.ts";
import { summarizeEpisodeCoverage } from "@/domain/media/derivations.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { getConfiguredLibraryPaths } from "@/features/media/shared/config-support.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { DomainInputError, DomainPathError, InfrastructureError } from "@/features/errors.ts";
import {
  buildEpisodeFileMappingIndex,
  buildScannedFileLibrarySignals,
  buildScannedFileNamingPlan,
  discoverImportScanFiles,
  enrichImportScanFiles,
  enrichedEpisodeNumbers,
  extractScanCandidatePaths,
  findBestRemoteCandidate,
  loadImportScanMediaRows,
  loadMappedEpisodeRows,
  loadScopedEpisodeRows,
  roundConfidence,
  selectUnitRowsForFile,
} from "@/features/operations/import-scan/import-path-scan-helpers.ts";
import {
  findBestLocalMediaMatch,
  scoreMediaRowMatch,
} from "@/features/operations/library/library-import-analysis-support.ts";
import { toMediaSearchCandidate } from "@/features/operations/library/library-import.ts";
import type { NamingSettings } from "@/features/operations/repository/types.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";
import { tryDatabasePromise, type TryDatabasePromise } from "@/infra/effect/db.ts";
import {
  FileSystem,
  isWithinPathRoot,
  type FileSystemShape,
} from "@/infra/filesystem/filesystem.ts";
import { MediaProbe, type MediaProbeShape } from "@/infra/media/probe.ts";

const scanImportPathEffect = Effect.fn("ImportPathScanService.scanImportPathEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    mediaId?: number;
    db: AppDatabase;
    fs: FileSystemShape;
    limit?: number;
    mediaReadRepository: typeof MediaReadRepository.Service;
    mediaProbe: MediaProbeShape;
    namingSettings: NamingSettings;
    path: string;
    tryDatabasePromise: TryDatabasePromise;
  }) {
    const discovery = yield* discoverImportScanFiles({
      fs: input.fs,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      path: input.path,
    });
    const animeRows = yield* loadImportScanMediaRows({
      ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
      mediaReadRepository: input.mediaReadRepository,
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
    const namingSettings = input.namingSettings;
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
        return yield* new InfrastructureError({
          message: `Selected media ${input.mediaId} is unavailable for import scan`,
          cause: new Error(`Media ${input.mediaId} not found in database`),
        });
      }

      candidateMap.set(selectedAnimeRow.id, yield* toMediaSearchCandidate(selectedAnimeRow));
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
      candidateMap.set(row.id, yield* toMediaSearchCandidate(row));
    }

    return {
      candidates: [...candidateMap.values()],
      files: enrichedFiles.map((file) => {
        const localMatch = input.mediaId
          ? selectedAnimeRow
          : findBestLocalMediaMatch(file.parsed_title, animeRows);
        const remoteMatch =
          !input.mediaId && !localMatch
            ? findBestRemoteCandidate(file.parsed_title, [...candidateMap.values()])
            : undefined;
        const remoteCandidate = remoteMatch?.candidate;
        let matchConfidence: number | undefined;

        if (input.mediaId) {
          matchConfidence = 1;
        } else if (localMatch) {
          matchConfidence = roundConfidence(scoreMediaRowMatch(file.parsed_title, localMatch));
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

export interface ImportPathScanServiceShape {
  readonly scanImportPath: (input: {
    readonly mediaId?: number;
    readonly limit?: number;
    readonly path: string;
  }) => Effect.Effect<
    ScanResult,
    DatabaseError | DomainInputError | DomainPathError | InfrastructureError
  >;
}

export class ImportPathScanService extends Effect.Service<ImportPathScanService>()(
  "@bakarr/api/ImportPathScanService",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const aniList = yield* AniListClient;
      const fs = yield* FileSystem;
      const mediaProbe = yield* MediaProbe;
      const mediaReadRepository = yield* MediaReadRepository;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

      const scanImportPath = Effect.fn("ImportPathScanService.scanImportPath")(function* (input: {
        readonly mediaId?: number;
        readonly limit?: number;
        readonly path: string;
      }) {
        const config = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
          Effect.mapError((error: RuntimeConfigSnapshotError) =>
            error instanceof DatabaseError
              ? error
              : new InfrastructureError({
                  message: "Failed to load runtime config for import scan",
                  cause: error,
                }),
          ),
        );
        const canonicalPath = yield* fs.realPath(input.path).pipe(
          Effect.mapError(
            (cause) =>
              new DomainPathError({
                cause,
                message: `Import path is inaccessible: ${input.path}`,
              }),
          ),
        );

        const allowedPrefixes = [
          ...new Set(
            [
              ...getConfiguredLibraryPaths(config.library),
              config.library.recycle_path,
              config.downloads.root_path,
            ]
              .map((path) => path.trim())
              .filter((path) => path.length > 0),
          ),
        ];

        const isAllowed = allowedPrefixes.some((prefix) => isWithinPathRoot(canonicalPath, prefix));

        if (!isAllowed) {
          return yield* new DomainInputError({
            message: "Import path must be inside library, recycle, or downloads root",
          });
        }

        return yield* scanImportPathEffect({
          aniList,
          ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
          db,
          fs,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          mediaReadRepository,
          mediaProbe,
          namingSettings: {
            movieNamingFormat: config.library.movie_naming_format,
            namingFormat: config.library.naming_format,
            preferredTitle: config.library.preferred_title,
          },
          path: canonicalPath,
          tryDatabasePromise,
        }).pipe(
          Effect.mapError((error) =>
            error instanceof DatabaseError ||
            error instanceof DomainInputError ||
            error instanceof DomainPathError
              ? error
              : new InfrastructureError({
                  message: "Failed to scan import path",
                  cause: error,
                }),
          ),
        );
      });

      return { scanImportPath } satisfies ImportPathScanServiceShape;
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export const ImportPathScanServiceLive = ImportPathScanService.Default;
