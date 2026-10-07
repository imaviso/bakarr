import { brandMediaId, type MediaSearchResult, type ScanResult } from "@packages/shared/index.ts";
import type {
  ImportCandidateSelectionRequest,
  ImportCandidateSelectionResult,
  ImportFileMappingRequest,
  ImportFileMediaRequest,
  ImportFileToggleRequest,
  ImportPlanRequest,
  ImportPlanResult,
  ImportSelectAllRequest,
} from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { summarizeEpisodeCoverage } from "@/features/media/shared/derivations.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { TenraiClient } from "@/features/media/metadata/tenrai.ts";
import { searchMediaWithFallback } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { getConfiguredLibraryPaths } from "@/features/media/shared/config-support.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { DomainInputError, DomainPathError, InfrastructureError } from "@/features/errors.ts";
import {
  buildUnitFileMappingIndex,
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
import {
  applyImportCandidateSelection,
  buildInitialImportSelection,
  selectAllImportFiles,
  setImportFileMappingSelection,
  setImportFileMediaSelection,
  toggleImportFileSelection,
} from "@/features/operations/import-scan/import-selection-support.ts";
import { toMediaSearchCandidate } from "@/features/operations/library/library-import.ts";
import type { NamingSettings } from "@/features/operations/repository/types.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";
import {
  FileSystem,
  isWithinPathRoot,
  type FileSystemShape,
} from "@/infra/filesystem/filesystem.ts";
import {
  LibraryNaming,
  type LibraryNamingShape,
} from "@/features/operations/library/library-naming.ts";
import { MediaProbe, type MediaProbeShape } from "@/infra/media/probe.ts";
import { Context, Effect, Layer } from "effect";

const scanImportPathEffect = Effect.fn("ImportPathScanService.scanImportPathEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    tenrai: typeof TenraiClient.Service;
    mediaId?: number;
    fs: FileSystemShape;
    limit?: number;
    mediaRepository: typeof MediaRepository.Service;
    mediaProbe: MediaProbeShape;
    naming: LibraryNamingShape;
    namingSettings: NamingSettings;
    path: string;
  }) {
    const discovery = yield* discoverImportScanFiles({
      fs: input.fs,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      path: input.path,
    });
    const animeRows = yield* loadImportScanMediaRows({
      ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
      mediaRepository: input.mediaRepository,
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
      episodeNumberCandidates,
      mediaRepository: input.mediaRepository,
    });
    const mappingIndex = buildUnitFileMappingIndex(mappedEpisodeRows);
    const namingSettings = input.namingSettings;
    const animeRowsById = new Map(animeRows.map((row) => [row.id, row]));
    const scopedEpisodeRows = yield* loadScopedEpisodeRows({
      animeIds: animeRows.map((row) => row.id),
      episodeNumberCandidates,
      mediaRepository: input.mediaRepository,
    });
    const episodeRowsByAnimeEpisode = new Map(
      scopedEpisodeRows.map(
        (
          row,
        ): [
          string,
          {
            readonly aired: string | null;
            readonly mediaId: number;
            readonly number: number;
            readonly title: string | null;
          },
        ] => [`${row.mediaId}:${row.number}`, row],
      ),
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
        const remoteSearch = yield* searchMediaWithFallback({
          aniList: input.aniList,
          mediaKind: "anime",
          query: parsedTitle,
          tenrai: input.tenrai,
        });

        for (const candidate of remoteSearch.results.slice(0, 5)) {
          candidateMap.set(candidate.id, candidate);
        }
      }
    }

    for (const row of animeRows) {
      candidateMap.set(row.id, yield* toMediaSearchCandidate(row));
    }

    const files = yield* Effect.forEach(enrichedFiles, (file) =>
      Effect.gen(function* () {
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
            : null;
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
        const namingPlan = yield* buildScannedFileNamingPlan({
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
          naming: input.naming,
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
    );
    const initialSelection = buildInitialImportSelection(files);

    return {
      candidates: [...candidateMap.values()],
      files,
      initial_selection: {
        selected_candidate_ids: [...initialSelection.selected_candidate_ids],
        selected_files: [...initialSelection.selected_files],
      },
      skipped: discovery.skippedFiles,
      total_scanned: discovery.analyzed.length,
      truncated: discovery.truncated || undefined,
    } satisfies ScanResult;
  },
);

export interface ImportPathScanServiceShape {
  readonly applyImportCandidateSelection: (
    input: ImportCandidateSelectionRequest,
  ) => Effect.Effect<ImportCandidateSelectionResult>;
  readonly planImportSelection: (
    input: ImportPlanRequest,
  ) => Effect.Effect<ImportPlanResult, DatabaseError>;
  readonly scanImportPath: (input: {
    readonly mediaId?: number;
    readonly limit?: number;
    readonly path: string;
  }) => Effect.Effect<
    ScanResult,
    DatabaseError | DomainInputError | DomainPathError | InfrastructureError
  >;
  readonly selectAllImportFiles: (
    input: ImportSelectAllRequest,
  ) => Effect.Effect<ImportCandidateSelectionResult>;
  readonly setImportFileMapping: (
    input: ImportFileMappingRequest,
  ) => Effect.Effect<ImportCandidateSelectionResult>;
  readonly setImportFileMedia: (
    input: ImportFileMediaRequest,
  ) => Effect.Effect<ImportCandidateSelectionResult>;
  readonly toggleImportFile: (
    input: ImportFileToggleRequest,
  ) => Effect.Effect<ImportCandidateSelectionResult>;
}

export class ImportPathScanService extends Context.Service<
  ImportPathScanService,
  ImportPathScanServiceShape
>()("@bakarr/api/ImportPathScanService") {
  static readonly layer = Layer.effect(
    ImportPathScanService,
    Effect.gen(function* () {
      const aniList = yield* AniListClient;
      const tenrai = yield* TenraiClient;
      const fs = yield* FileSystem;
      const mediaProbe = yield* MediaProbe;
      const mediaRepository = yield* MediaRepository;
      const naming = yield* LibraryNaming;
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
          tenrai,
          ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
          fs,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          mediaRepository,
          mediaProbe,
          naming,
          namingSettings: {
            movieNamingFormat: config.library.movie_naming_format,
            namingFormat: config.library.naming_format,
            preferredTitle: config.library.preferred_title,
          },
          path: canonicalPath,
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

      const applySelection = Effect.fn("ImportPathScanService.applyImportCandidateSelection")(
        (input: ImportCandidateSelectionRequest) =>
          Effect.sync(() => applyImportCandidateSelection(input)),
      );

      const planImportSelection = Effect.fn("ImportPathScanService.planImportSelection")(function* (
        input: ImportPlanRequest,
      ) {
        const mediaIds = [...new Set(input.selected_files.map((file) => file.media_id))];
        const existing = yield* mediaRepository.findExistingMediaIds(mediaIds);
        const existingIds = new Set(existing);
        const seenPaths = new Set<string>();
        const unimportable: ImportPlanResult["unimportable"] = [];

        for (const file of input.selected_files) {
          if (seenPaths.has(file.source_path)) {
            unimportable.push({
              reason: "This file is selected more than once",
              source_path: file.source_path,
            });
            continue;
          }

          seenPaths.add(file.source_path);

          if (!Number.isFinite(file.unit_number) || Math.floor(file.unit_number) < 1) {
            unimportable.push({
              reason: "Set an episode number of 1 or higher before importing",
              source_path: file.source_path,
            });
          }
        }

        return {
          missing_media_ids: mediaIds.filter((id) => !existingIds.has(id)),
          unimportable,
        } satisfies ImportPlanResult;
      });

      const selectAllSelection = Effect.fn("ImportPathScanService.selectAllImportFiles")(
        (input: ImportSelectAllRequest) => Effect.sync(() => selectAllImportFiles(input)),
      );

      const setFileMappingSelection = Effect.fn("ImportPathScanService.setImportFileMapping")(
        (input: ImportFileMappingRequest) =>
          Effect.sync(() => setImportFileMappingSelection(input)),
      );

      const setFileMediaSelection = Effect.fn("ImportPathScanService.setImportFileMedia")(
        (input: ImportFileMediaRequest) => Effect.sync(() => setImportFileMediaSelection(input)),
      );

      const toggleFileSelection = Effect.fn("ImportPathScanService.toggleImportFile")(
        (input: ImportFileToggleRequest) => Effect.sync(() => toggleImportFileSelection(input)),
      );

      return {
        applyImportCandidateSelection: applySelection,
        planImportSelection,
        scanImportPath,
        selectAllImportFiles: selectAllSelection,
        setImportFileMapping: setFileMappingSelection,
        setImportFileMedia: setFileMediaSelection,
        toggleImportFile: toggleFileSelection,
      } satisfies ImportPathScanServiceShape;
    }),
  );
}

export const ImportPathScanServiceLive = ImportPathScanService.layer;
