import { Effect, Option } from "effect";
import { brandMediaId, type Config, type DownloadSourceMetadata } from "@packages/shared/index.ts";

import type { downloads } from "@/db/schema.ts";
import { media } from "@/db/schema.ts";
import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { DomainPathError, StoredDataError } from "@/features/errors.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import type {
  MediaUnitRepositoryShape,
  UpsertUnitFileError,
} from "@/features/media/units/media-unit-repository.ts";
import { classifyMediaArtifact } from "@/infra/media/identity/identity.ts";
import { probeMediaMetadataOrUndefined, type MediaProbeShape } from "@/infra/media/probe.ts";
import type { FileSystemError, FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { buildUnitFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";
import {
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "@/features/operations/library/naming-format-support.ts";
import { ImportFileError } from "@/features/operations/download/download-file-import-errors.ts";
import { importDownloadedFile } from "@/features/operations/download/download-file-import-support.ts";
import {
  parseCoveredEpisodesEffect,
  resolveReconciledBatchEpisodeNumbers,
} from "@/features/operations/download/download-coverage.ts";
import {
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
} from "@/features/operations/download/download-paths.ts";
import {
  decodeDownloadSourceMetadata,
  encodeDownloadEventMetadata,
} from "@/features/operations/repository/download-row-codec.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import type {
  OperationsConflictError,
  OperationsNotFoundError,
} from "@/features/operations/errors.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

type DownloadRow = typeof downloads.$inferSelect;
type MediaRow = typeof media.$inferSelect;

type MaybeCleanupImportedTorrent = (
  config: Config | null | undefined,
  infoHash: string | null,
) => Effect.Effect<void>;

type DownloadReconciliationContext = {
  readonly repo: typeof DownloadRepository.Service;
  readonly mediaRepository: typeof MediaRepository.Service;
  readonly mediaUnitRepository: MediaUnitRepositoryShape;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly nowIso: () => Effect.Effect<string>;
  readonly randomUuid: () => Effect.Effect<string>;
  readonly maybeCleanupImportedTorrent: MaybeCleanupImportedTorrent;
  readonly eventBus: typeof EventBus.Service;
  readonly row: DownloadRow;
  readonly animeRow: MediaRow;
  readonly runtimeConfig: Config;
  readonly storedSourceMetadata: DownloadSourceMetadata | undefined;
  readonly resolvedContentRoot: string;
};

type RuntimeConfigLoader = () => Effect.Effect<Config, RuntimeConfigSnapshotError>;

type BatchEpisodeRow = {
  readonly aired: string | null;
  readonly downloaded: boolean;
  readonly filePath: string | null;
  readonly number: number;
  readonly title: string | null;
};

export type ReconcileCompletedError =
  | DatabaseError
  | MediaNotFoundError
  | StoredDataError
  | DomainPathError
  | ImportFileError
  | FileSystemError
  | UpsertUnitFileError
  | RuntimeConfigSnapshotError;

export type ReconcileByIdError =
  | OperationsNotFoundError
  | OperationsConflictError
  | ReconcileCompletedError;

export const loadDownloadReconciliationContext = Effect.fn(
  "DownloadReconcile.loadDownloadReconciliationContext",
)(function* (
  input: Pick<
    DownloadReconciliationContext,
    | "repo"
    | "mediaUnitRepository"
    | "fs"
    | "mediaProbe"
    | "eventBus"
    | "maybeCleanupImportedTorrent"
    | "nowIso"
    | "randomUuid"
    | "row"
  > & {
    readonly contentPath: string;
    readonly getRuntimeConfig: RuntimeConfigLoader;
    readonly mediaRepository: typeof MediaRepository.Service;
  },
) {
  const storedSourceMetadata = yield* decodeDownloadSourceMetadata(input.row.sourceMetadata);
  const animeRow = yield* input.mediaRepository.getMediaRow(input.row.mediaId);
  const runtimeConfig = yield* input.getRuntimeConfig();
  const resolvedContentRoot = yield* resolveAccessibleDownloadPath(
    input.fs,
    input.contentPath,
    runtimeConfig.downloads.remote_path_mappings,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new DomainPathError({
          cause,
          message: `Download content path is inaccessible: ${input.contentPath}`,
        }),
    ),
  );

  if (Option.isNone(resolvedContentRoot)) {
    return Option.none();
  }

  return Option.some({
    repo: input.repo,
    mediaRepository: input.mediaRepository,
    mediaUnitRepository: input.mediaUnitRepository,
    animeRow,
    eventBus: input.eventBus,
    fs: input.fs,
    mediaProbe: input.mediaProbe,
    maybeCleanupImportedTorrent: input.maybeCleanupImportedTorrent,
    nowIso: input.nowIso,
    resolvedContentRoot: resolvedContentRoot.value,
    randomUuid: input.randomUuid,
    runtimeConfig,
    row: input.row,
    storedSourceMetadata,
  } satisfies DownloadReconciliationContext);
});

export const reconcileBatchDownloadEffect = Effect.fn("DownloadReconcile.reconcileBatchDownload")(
  function* (input: DownloadReconciliationContext) {
    if (!input.row.isBatch) {
      return false;
    }

    const coveredUnits = yield* parseCoveredEpisodesEffect(input.row.coveredUnits);
    const batchPaths = yield* resolveBatchContentPaths(input.fs, input.resolvedContentRoot).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: `Download content path is inaccessible: ${input.resolvedContentRoot}`,
          }),
      ),
    );

    if (batchPaths.length === 0) {
      return false;
    }

    const accountedEpisodes = new Set<number>();
    const expectedEpisodeCount = coveredUnits.length > 0 ? new Set(coveredUnits).size : undefined;
    let alreadyImportedEpisodeCount = 0;
    let importedCount = 0;

    const batchItems: Array<{
      path: string;
      relevantEpisodes: number[];
      primaryEpisode: number;
    }> = [];

    const allRelevantEpisodes = new Set<number>();

    for (const path of batchPaths) {
      const fileName = path.substring(path.lastIndexOf("/") + 1);
      const classification = classifyMediaArtifact(path, fileName);
      if (classification.kind === "extra" || classification.kind === "sample") {
        continue;
      }

      const unitNumbers = resolveReconciledBatchEpisodeNumbers({
        coveredUnits,
        parseVolumeNumbers: input.animeRow.mediaKind !== "anime",
        path,
        totalCandidateCount: batchPaths.length,
      });
      if (unitNumbers.length === 0) {
        continue;
      }

      const relevantEpisodes =
        coveredUnits.length > 0
          ? unitNumbers.filter((ep) => coveredUnits.includes(ep))
          : unitNumbers;

      if (relevantEpisodes.length === 0) {
        continue;
      }

      for (const ep of relevantEpisodes) {
        accountedEpisodes.add(ep);
        allRelevantEpisodes.add(ep);
      }

      batchItems.push({
        path,
        relevantEpisodes,
        primaryEpisode: relevantEpisodes[0] ?? 0,
      });
    }

    const namingFormat = selectNamingFormat(input.animeRow, {
      movieNamingFormat: input.runtimeConfig.library.movie_naming_format,
      namingFormat: input.runtimeConfig.library.naming_format,
    });

    const allEpisodeRows: BatchEpisodeRow[] =
      allRelevantEpisodes.size > 0
        ? yield* input.mediaRepository
            .loadUnitsByNumbers(input.row.mediaId, [...allRelevantEpisodes])
            .pipe(
              Effect.map((rows) =>
                rows.map((r) => ({
                  aired: r.aired,
                  downloaded: r.downloaded,
                  filePath: r.filePath,
                  number: r.number,
                  title: r.title,
                })),
              ),
            )
        : [];

    const episodeMap = new Map<number, BatchEpisodeRow>();
    for (const epRow of allEpisodeRows) {
      episodeMap.set(epRow.number, epRow);
    }

    for (const item of batchItems) {
      const { path, relevantEpisodes, primaryEpisode } = item;

      const episodeRowsForNaming = relevantEpisodes
        .map((ep) => episodeMap.get(ep))
        .filter((r): r is BatchEpisodeRow => r !== undefined)
        .map((r) => ({ title: r.title, aired: r.aired }));

      const existingEpisode = episodeMap.get(primaryEpisode);

      if (existingEpisode?.downloaded && existingEpisode?.filePath) {
        alreadyImportedEpisodeCount += relevantEpisodes.length;
        continue;
      }

      const initialNamingPlan = buildUnitFilenamePlan({
        animeRow: input.animeRow,
        unitNumbers: relevantEpisodes,
        episodeRows: episodeRowsForNaming,
        filePath: path,
        namingFormat,
        preferredTitle: input.runtimeConfig.library.preferred_title,
        ...(input.storedSourceMetadata
          ? { downloadSourceMetadata: input.storedSourceMetadata }
          : {}),
      });
      const localMediaMetadata = hasMissingLocalMediaNamingFields(initialNamingPlan.missingFields)
        ? yield* probeMediaMetadataOrUndefined(input.mediaProbe, path)
        : undefined;

      const managedPath = yield* importDownloadedFile(
        input.fs,
        input.animeRow,
        primaryEpisode,
        path,
        input.runtimeConfig.library.import_mode,
        {
          unitNumbers: relevantEpisodes,
          episodeRows: episodeRowsForNaming,
          namingFormat,
          preferredTitle: input.runtimeConfig.library.preferred_title,
          randomUuid: input.randomUuid,
          ...(input.storedSourceMetadata
            ? { downloadSourceMetadata: input.storedSourceMetadata }
            : {}),
          ...(localMediaMetadata ? { localMediaMetadata } : {}),
        },
      );
      yield* input.mediaUnitRepository.upsertUnitFiles(
        input.row.mediaId,
        relevantEpisodes,
        managedPath,
      );

      for (const unitNumber of relevantEpisodes) {
        const existing = episodeMap.get(unitNumber);
        episodeMap.set(unitNumber, {
          aired: existing?.aired ?? null,
          downloaded: true,
          filePath: managedPath,
          number: unitNumber,
          title: existing?.title ?? null,
        });
      }

      importedCount += 1;
    }

    const batchAlreadyImported =
      importedCount === 0 &&
      accountedEpisodes.size > 0 &&
      alreadyImportedEpisodeCount === accountedEpisodes.size &&
      (expectedEpisodeCount === undefined || accountedEpisodes.size === expectedEpisodeCount);

    if (importedCount === 0 && !batchAlreadyImported) {
      yield* Effect.logWarning(
        "Batch reconciliation skipped all files; leaving unreconciled for retry",
      ).pipe(
        Effect.annotateLogs({
          mediaTitle: input.row.mediaTitle,
          downloadId: input.row.id,
        }),
      );
      return true;
    }

    const batchNow = yield* input.nowIso();
    const storedCoveredEpisodes = yield* parseCoveredEpisodesEffect(input.row.coveredUnits);
    const eventMetadata = yield* encodeDownloadEventMetadata({
      covered_units: storedCoveredEpisodes,
      imported_path: input.animeRow.rootFolder,
      ...(input.storedSourceMetadata ? { source_metadata: input.storedSourceMetadata } : {}),
    });

    yield* input.repo.finalizeDownloadImport({
      downloadId: input.row.id,
      fromStatus: input.row.status,
      now: batchNow,
      mediaId: input.row.mediaId,
      eventType: "download.imported.batch",
      eventMessage: batchAlreadyImported
        ? `Reconciled already-imported batch torrent for ${input.row.mediaTitle}`
        : `Imported batch torrent for ${input.row.mediaTitle}`,
      eventMetadata,
      logEventType: "downloads.reconciled.batch",
      logMessage: batchAlreadyImported
        ? `Marked already-imported batch torrent as reconciled for ${input.row.mediaTitle}`
        : `Mapped completed batch torrent for ${input.row.mediaTitle}`,
    });
    yield* input.maybeCleanupImportedTorrent(input.runtimeConfig, input.row.infoHash);
    yield* input.eventBus.publish({
      type: "DownloadFinished",
      payload: {
        media_id: brandMediaId(input.row.mediaId),
        imported_path: input.animeRow.rootFolder,
        source_metadata: input.storedSourceMetadata,
        title: input.row.torrentName,
      },
    });

    return true;
  },
);

export const reconcileSingleDownloadEffect = Effect.fn(
  "DownloadReconcile.reconcileCompletedTorrentSingle",
)(function* (input: DownloadReconciliationContext) {
  if (!input.row.contentPath && !input.row.savePath) {
    return;
  }

  if (input.row.reconciledAt) {
    return;
  }

  const existingRows = yield* input.mediaRepository.loadUnitsByNumbers(input.row.mediaId, [
    input.row.unitNumber,
  ]);
  const existingEpisode = existingRows[0];

  if (existingEpisode?.downloaded && existingEpisode?.filePath) {
    const alreadyImportedNow = yield* input.nowIso();
    yield* input.repo.markDownloadReconciled({
      downloadId: input.row.id,
      now: alreadyImportedNow,
    });
    return;
  }

  const expectedAirDate =
    existingEpisode?.aired ??
    input.storedSourceMetadata?.air_date ??
    (input.storedSourceMetadata?.source_identity?.scheme === "daily"
      ? input.storedSourceMetadata.source_identity.air_dates?.[0]
      : undefined);

  const resolvedPath = yield* resolveCompletedContentPath(
    input.fs,
    input.resolvedContentRoot,
    input.row.unitNumber,
    expectedAirDate ? { expectedAirDate } : undefined,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new DomainPathError({
          cause,
          message: `Download content path is inaccessible: ${input.resolvedContentRoot}`,
        }),
    ),
  );

  if (Option.isNone(resolvedPath)) {
    return;
  }
  const resolvedPathValue = resolvedPath.value;

  const namingFormat = selectNamingFormat(input.animeRow, {
    movieNamingFormat: input.runtimeConfig.library.movie_naming_format,
    namingFormat: input.runtimeConfig.library.naming_format,
  });
  const episodeRows = yield* input.mediaRepository
    .loadUnitsByNumbers(input.row.mediaId, [input.row.unitNumber])
    .pipe(Effect.map((rows) => rows.map((r) => ({ aired: r.aired, title: r.title }))));
  const initialNamingPlan = buildUnitFilenamePlan({
    animeRow: input.animeRow,
    unitNumbers: [input.row.unitNumber],
    episodeRows,
    filePath: resolvedPathValue,
    namingFormat,
    preferredTitle: input.runtimeConfig.library.preferred_title,
    ...(input.storedSourceMetadata ? { downloadSourceMetadata: input.storedSourceMetadata } : {}),
  });
  const localMediaMetadata = hasMissingLocalMediaNamingFields(initialNamingPlan.missingFields)
    ? yield* probeMediaMetadataOrUndefined(input.mediaProbe, resolvedPathValue)
    : undefined;

  const managedPath = yield* importDownloadedFile(
    input.fs,
    input.animeRow,
    input.row.unitNumber,
    resolvedPathValue,
    input.runtimeConfig.library.import_mode,
    {
      episodeRows,
      namingFormat,
      preferredTitle: input.runtimeConfig.library.preferred_title,
      randomUuid: input.randomUuid,
      ...(input.storedSourceMetadata ? { downloadSourceMetadata: input.storedSourceMetadata } : {}),
      ...(localMediaMetadata ? { localMediaMetadata } : {}),
    },
  );
  yield* input.mediaUnitRepository.upsertUnitFiles(
    input.row.mediaId,
    [input.row.unitNumber],
    managedPath,
  );
  const singleNow = yield* input.nowIso();
  const storedCoveredEpisodes = yield* parseCoveredEpisodesEffect(input.row.coveredUnits);
  const eventMetadata = yield* encodeDownloadEventMetadata({
    covered_units: storedCoveredEpisodes,
    imported_path: managedPath,
    ...(input.storedSourceMetadata ? { source_metadata: input.storedSourceMetadata } : {}),
  });

  yield* input.repo.finalizeDownloadImport({
    downloadId: input.row.id,
    fromStatus: input.row.status,
    now: singleNow,
    mediaId: input.row.mediaId,
    eventType: "download.imported",
    eventMessage: `Imported ${input.row.mediaTitle} episode ${input.row.unitNumber}`,
    eventMetadata,
    logEventType: "downloads.reconciled",
    logMessage: `Mapped completed torrent for ${input.row.mediaTitle} episode ${input.row.unitNumber}`,
  });
  yield* input.maybeCleanupImportedTorrent(input.runtimeConfig, input.row.infoHash);
  yield* input.eventBus.publish({
    type: "DownloadFinished",
    payload: {
      media_id: brandMediaId(input.row.mediaId),
      imported_path: managedPath,
      source_metadata: input.storedSourceMetadata,
      title: input.row.torrentName,
    },
  });
});
