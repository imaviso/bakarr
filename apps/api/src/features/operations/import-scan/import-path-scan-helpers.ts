import { Effect, Result, Stream } from "effect";
import {
  brandMediaId,
  type FileUnitMapping,
  type MediaSearchResult,
  type PreferredTitle,
  type ScannedFile,
  type SkippedFile,
} from "@packages/shared/index.ts";
import { scoreAnimeSearchResultMatch } from "@/features/media/shared/derivations.ts";
import { DomainPathError } from "@/features/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { scanVideoFilesStream } from "@/features/operations/import-scan/file-scanner.ts";
import {
  analyzeScannedFile,
  titlesMatch,
  type AnalyzedFile,
} from "@/features/operations/library/library-import-analysis-support.ts";
import type { LibraryNamingShape } from "@/features/operations/library/library-naming.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";

import {
  mergeProbedMediaMetadata,
  probeMediaMetadataOrUndefined,
  shouldProbeMediaMetadata,
  type MediaProbeShape,
} from "@/infra/media/probe.ts";

export const DEFAULT_IMPORT_SCAN_LIMIT = 300;
export const MAX_IMPORT_SCAN_LIMIT = 2000;

export function resolveImportScanLimit(limit?: number) {
  const requested = limit ?? DEFAULT_IMPORT_SCAN_LIMIT;
  return Math.min(Math.max(1, requested), MAX_IMPORT_SCAN_LIMIT);
}

export function toUnitNumbers(file: Pick<ScannedFile, "unit_number" | "unit_numbers">) {
  if (file.unit_numbers?.length) {
    return file.unit_numbers;
  }

  return file.unit_number > 0 ? [file.unit_number] : [];
}

export function enrichedEpisodeNumbers(
  files: readonly Pick<ScannedFile, "unit_number" | "unit_numbers">[],
) {
  return files.flatMap((file) => toUnitNumbers(file));
}

export function selectUnitRowsForFile(
  file: Pick<ScannedFile, "unit_number" | "unit_numbers">,
  rowsByMediaUnit: Map<
    string,
    {
      aired?: string | null;
      mediaId: number;
      number: number;
      title?: string | null;
    }
  >,
  mediaId?: number,
) {
  if (!mediaId) {
    return undefined;
  }

  return toUnitNumbers(file).flatMap((unitNumber) => {
    const row = rowsByMediaUnit.get(`${mediaId}:${unitNumber}`);
    return row
      ? [
          {
            ...(row.aired === undefined ? {} : { aired: row.aired }),
            ...(row.title === undefined ? {} : { title: row.title }),
          },
        ]
      : [];
  });
}

export function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}

export function findBestRemoteCandidate(
  parsedTitle: string,
  candidates: readonly MediaSearchResult[],
) {
  let bestCandidate: MediaSearchResult | undefined;
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

type UnitFileMappingRow = {
  media_id: number;
  media_title: string;
  unit_number: number;
  file_path: string | null;
};

export type UnitFileMappingIndex = {
  byMediaUnit: Map<string, UnitFileMappingRow>;
  byPath: Map<string, FileUnitMapping>;
};

export function buildUnitFileMappingIndex(
  rows: readonly UnitFileMappingRow[],
): UnitFileMappingIndex {
  const byMediaUnit = new Map<string, UnitFileMappingRow>();
  const byPath = new Map<string, FileUnitMapping>();

  for (const row of rows) {
    if (!row.file_path) {
      continue;
    }

    byMediaUnit.set(`${row.media_id}:${row.unit_number}`, row);

    const existing = byPath.get(row.file_path);
    if (existing) {
      const unitNumbers = new Set([...(existing.unit_numbers ?? []), row.unit_number]);
      byPath.set(row.file_path, {
        ...existing,
        unit_numbers: [...unitNumbers].toSorted((left, right) => left - right),
      });
      continue;
    }

    byPath.set(row.file_path, {
      media_id: brandMediaId(row.media_id),
      media_title: row.media_title,
      unit_numbers: [row.unit_number],
      file_path: row.file_path,
    });
  }

  return { byMediaUnit, byPath };
}

export function buildScannedFileLibrarySignals(input: {
  file: Pick<ScannedFile, "unit_number" | "unit_numbers" | "source_path">;
  mappingIndex: UnitFileMappingIndex;
  targetAnime?: { id: number; title: string } | null | undefined;
}) {
  const existing_mapping = input.mappingIndex.byPath.get(input.file.source_path);
  const unitNumbers = toUnitNumbers(input.file);
  const { targetAnime } = input;

  if (!targetAnime || unitNumbers.length === 0) {
    return { existing_mapping };
  }

  const conflicts = unitNumbers.flatMap((unitNumber) => {
    const existing = input.mappingIndex.byMediaUnit.get(`${targetAnime.id}:${unitNumber}`);

    if (!existing || existing.file_path === input.file.source_path) {
      return [];
    }

    return [existing];
  });

  if (conflicts.length === 0) {
    return { existing_mapping };
  }

  const unit_conflict: FileUnitMapping = {
    media_id: brandMediaId(targetAnime.id),
    media_title: targetAnime.title,
    unit_numbers: [...new Set(conflicts.map((row) => row.unit_number))].toSorted(
      (left, right) => left - right,
    ),
    file_path: conflicts[0]?.file_path ?? undefined,
  };

  return {
    unit_conflict,
    existing_mapping,
  };
}

export const buildScannedFileNamingPlan = Effect.fn("Operations.buildScannedFileNamingPlan")(
  function* (input: {
    animeRow?:
      | {
          endDate?: string | null;
          endYear?: number | null;
          format: string;
          rootFolder?: string;
          startDate?: string | null;
          startYear?: number | null;
          titleEnglish?: string | null;
          titleNative?: string | null;
          titleRomaji: string;
        }
      | undefined;
    episodeRows?: readonly { aired?: string | null; title?: string | null }[];
    file: Pick<
      ScannedFile,
      | "air_date"
      | "audio_channels"
      | "audio_codec"
      | "unit_number"
      | "unit_numbers"
      | "unit_title"
      | "group"
      | "quality"
      | "resolution"
      | "season"
      | "source_path"
      | "source_identity"
      | "video_codec"
    >;
    naming: LibraryNamingShape;
    namingSettings: {
      movieNamingFormat: string;
      namingFormat: string;
      preferredTitle: PreferredTitle;
    };
  }) {
    if (!input.animeRow?.rootFolder) {
      return {};
    }

    const unitNumbers = toUnitNumbers(input.file);

    if (unitNumbers.length === 0) {
      return {};
    }

    const previewed = yield* Effect.result(
      input.naming.preview({
        downloadSourceMetadata: {
          ...(input.file.air_date === undefined ? {} : { air_date: input.file.air_date }),
          ...(input.file.audio_channels === undefined
            ? {}
            : { audio_channels: input.file.audio_channels }),
          ...(input.file.audio_codec === undefined ? {} : { audio_codec: input.file.audio_codec }),
          ...(input.file.unit_title === undefined ? {} : { unit_title: input.file.unit_title }),
          ...(input.file.group === undefined ? {} : { group: input.file.group }),
          ...(input.file.quality === undefined ? {} : { quality: input.file.quality }),
          ...(input.file.resolution === undefined ? {} : { resolution: input.file.resolution }),
          ...(input.file.source_identity === undefined
            ? {}
            : { source_identity: input.file.source_identity }),
          ...(input.file.video_codec === undefined ? {} : { video_codec: input.file.video_codec }),
        },
        unitNumbers,
        ...(input.episodeRows === undefined ? {} : { episodeRows: input.episodeRows }),
        localMediaMetadata: {
          ...(input.file.audio_channels === undefined || input.file.audio_channels === null
            ? {}
            : { audio_channels: input.file.audio_channels }),
          ...(input.file.audio_codec === undefined || input.file.audio_codec === null
            ? {}
            : { audio_codec: input.file.audio_codec }),
          ...(input.file.resolution === undefined || input.file.resolution === null
            ? {}
            : { resolution: input.file.resolution }),
          ...(input.file.video_codec === undefined || input.file.video_codec === null
            ? {}
            : { video_codec: input.file.video_codec }),
        },
        media: {
          ...(input.animeRow.endDate === undefined ? {} : { endDate: input.animeRow.endDate }),
          ...(input.animeRow.endYear === undefined ? {} : { endYear: input.animeRow.endYear }),
          format: input.animeRow.format,
          rootFolder: input.animeRow.rootFolder,
          ...(input.animeRow.startDate === undefined
            ? {}
            : { startDate: input.animeRow.startDate }),
          ...(input.animeRow.startYear === undefined
            ? {}
            : { startYear: input.animeRow.startYear }),
          ...(input.animeRow.titleEnglish === undefined
            ? {}
            : { titleEnglish: input.animeRow.titleEnglish }),
          ...(input.animeRow.titleNative === undefined
            ? {}
            : { titleNative: input.animeRow.titleNative }),
          titleRomaji: input.animeRow.titleRomaji,
        },
        namingFormat:
          input.animeRow.format === "MOVIE"
            ? input.namingSettings.movieNamingFormat
            : input.namingSettings.namingFormat,
        preferredTitle: input.namingSettings.preferredTitle,
        ...(input.file.season === undefined || input.file.season === null
          ? {}
          : { season: input.file.season }),
        sourcePath: input.file.source_path,
      }),
    );

    if (Result.isFailure(previewed)) {
      return {};
    }

    const plan = previewed.success.plan;
    return {
      naming_filename: previewed.success.filename,
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
  },
);

export interface DiscoverImportScanFilesResult {
  readonly canonicalPath: string;
  readonly analyzed: AnalyzedFile[];
  readonly episodeFiles: AnalyzedFile[];
  readonly skippedFiles: SkippedFile[];
  readonly truncated: boolean;
}

export const discoverImportScanFiles = Effect.fn("Operations.discoverImportScanFiles")(
  function* (input: {
    readonly fs: FileSystemShape;
    readonly limit?: number;
    readonly path: string;
  }) {
    const canonicalPath = yield* input.fs.realPath(input.path).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
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
          (cause) =>
            new DomainPathError({
              cause,
              message: `Import path is inaccessible: ${canonicalPath}`,
            }),
        ),
      ),
    );
    const truncated = scannedFiles.length > limit;
    const files = (truncated ? scannedFiles.slice(0, limit) : scannedFiles).toSorted((a, b) =>
      a.path.localeCompare(b.path),
    );
    const analyzed = files.map((file) => analyzeScannedFile(file, canonicalPath));
    const episodeFiles = analyzed.filter((entry) => !entry.skipped);
    const skippedFiles = analyzed.flatMap((entry) => (entry.skipped ? [entry.skipped] : []));

    return {
      analyzed,
      canonicalPath,
      episodeFiles,
      skippedFiles,
      truncated,
    } satisfies DiscoverImportScanFilesResult;
  },
);

export function extractScanCandidatePaths(files: readonly Pick<ScannedFile, "source_path">[]) {
  return [...new Set(files.map((entry) => entry.source_path).filter((value) => value.length > 0))];
}

const ENRICH_IMPORT_SCAN_CONCURRENCY = 4;

export const enrichImportScanFiles = Effect.fn("Operations.enrichImportScanFiles")(
  function* (input: {
    readonly files: readonly ScannedFile[];
    readonly mediaProbe: MediaProbeShape;
  }) {
    return yield* Effect.forEach(
      input.files,
      (file) =>
        Effect.gen(function* () {
          if (!shouldProbeMediaMetadata(file)) {
            return file;
          }

          const probeMetadata = yield* probeMediaMetadataOrUndefined(
            input.mediaProbe,
            file.source_path,
          );

          return mergeProbedMediaMetadata(file, probeMetadata);
        }),
      { concurrency: ENRICH_IMPORT_SCAN_CONCURRENCY },
    );
  },
);

export const loadImportScanMediaRows = (input: {
  readonly mediaId?: number;
  readonly mediaRepository: typeof MediaRepository.Service;
}) =>
  input.mediaId
    ? Effect.map(input.mediaRepository.getMediaRow(input.mediaId), (row) => [row])
    : input.mediaRepository.listAllMediaRows();

export const loadMappedEpisodeRows = (input: {
  readonly candidateAnimeIds: readonly number[];
  readonly candidatePaths: readonly string[];
  readonly episodeNumberCandidates: readonly number[];
  readonly mediaRepository: typeof MediaRepository.Service;
}) =>
  input.mediaRepository.listImportScanMappedUnits({
    mediaIds: input.candidateAnimeIds,
    paths: input.candidatePaths,
    unitNumbers: input.episodeNumberCandidates,
  });

export const loadScopedEpisodeRows = (input: {
  readonly animeIds: readonly number[];
  readonly episodeNumberCandidates: readonly number[];
  readonly mediaRepository: typeof MediaRepository.Service;
}) =>
  input.mediaRepository.listScopedUnitRows({
    mediaIds: input.animeIds,
    unitNumbers: input.episodeNumberCandidates,
  });
