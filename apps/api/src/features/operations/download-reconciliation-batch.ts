import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import { episodes } from "@/db/schema.ts";
import { classifyMediaArtifact } from "@/lib/media-identity.ts";
import { probeMediaMetadataOrUndefined } from "@/lib/media-probe.ts";
import {
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "@/features/operations/naming-support.ts";
import {
  importDownloadedFile,
  upsertEpisodeFilesAtomic,
} from "@/features/operations/download-support.ts";
import {
  parseCoveredEpisodesEffect,
  resolveReconciledBatchEpisodeNumbers,
} from "@/features/operations/download-coverage.ts";
import { resolveBatchContentPaths } from "@/features/operations/download-paths.ts";
import {
  OperationsInfrastructureError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import { encodeDownloadEventMetadata } from "@/features/operations/repository/download-repository.ts";
import {
  finalizeDownloadImport,
  type DownloadReconciliationContext,
} from "@/features/operations/download-reconciliation-shared.ts";

const mapReconciliationInfrastructureError = (cause: unknown) =>
  new OperationsInfrastructureError({
    cause,
    message: "Failed to reconcile completed download",
  });

type BatchEpisodeRow = {
  readonly aired: string | null;
  readonly downloaded: boolean;
  readonly filePath: string | null;
  readonly number: number;
  readonly title: string | null;
};

export const reconcileBatchDownloadEffect = Effect.fn("OperationsService.reconcileBatchDownload")(
  function* (input: DownloadReconciliationContext) {
    if (!input.row.isBatch) {
      return false;
    }

    const coveredEpisodes = yield* parseCoveredEpisodesEffect(input.row.coveredEpisodes);
    const batchPaths = yield* resolveBatchContentPaths(input.fs, input.resolvedContentRoot).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsPathError({
            cause,
            message: `Download content path is inaccessible: ${input.resolvedContentRoot}`,
          }),
      ),
    );

    if (batchPaths.length === 0) {
      return false;
    }

    const accountedEpisodes = new Set<number>();
    const expectedEpisodeCount =
      coveredEpisodes.length > 0 ? new Set(coveredEpisodes).size : undefined;
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

      const episodeNumbers = resolveReconciledBatchEpisodeNumbers({
        coveredEpisodes,
        path,
        totalCandidateCount: batchPaths.length,
      });
      if (episodeNumbers.length === 0) {
        continue;
      }

      const relevantEpisodes =
        coveredEpisodes.length > 0
          ? episodeNumbers.filter((ep) => coveredEpisodes.includes(ep))
          : episodeNumbers;

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
        ? yield* input.tryDatabasePromise("Failed to reconcile completed download", () =>
            input.db
              .select({
                aired: episodes.aired,
                downloaded: episodes.downloaded,
                filePath: episodes.filePath,
                number: episodes.number,
                title: episodes.title,
              })
              .from(episodes)
              .where(
                and(
                  eq(episodes.animeId, input.row.animeId),
                  inArray(episodes.number, [...allRelevantEpisodes]),
                ),
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

      const initialNamingPlan = buildEpisodeFilenamePlan({
        animeRow: input.animeRow,
        episodeNumbers: relevantEpisodes,
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
        input.importMode,
        {
          episodeNumbers: relevantEpisodes,
          episodeRows: episodeRowsForNaming,
          namingFormat,
          preferredTitle: input.runtimeConfig.library.preferred_title,
          randomUuid: input.randomUuid,
          ...(input.storedSourceMetadata
            ? { downloadSourceMetadata: input.storedSourceMetadata }
            : {}),
          ...(localMediaMetadata ? { localMediaMetadata } : {}),
        },
      ).pipe(Effect.mapError(mapReconciliationInfrastructureError));
      yield* upsertEpisodeFilesAtomic(
        input.db,
        input.row.animeId,
        relevantEpisodes,
        managedPath,
      ).pipe(Effect.mapError(mapReconciliationInfrastructureError));

      for (const episodeNumber of relevantEpisodes) {
        const existing = episodeMap.get(episodeNumber);
        episodeMap.set(episodeNumber, {
          aired: existing?.aired ?? null,
          downloaded: true,
          filePath: managedPath,
          number: episodeNumber,
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
          animeTitle: input.row.animeTitle,
          downloadId: input.row.id,
        }),
      );
      return true;
    }

    const batchNow = yield* input.nowIso();
    const storedCoveredEpisodes = yield* parseCoveredEpisodesEffect(input.row.coveredEpisodes);
    const eventMetadata = yield* encodeDownloadEventMetadata({
      covered_episodes: storedCoveredEpisodes,
      imported_path: input.animeRow.rootFolder,
      ...(input.storedSourceMetadata ? { source_metadata: input.storedSourceMetadata } : {}),
    });

    yield* finalizeDownloadImport({
      downloadId: input.row.id,
      fromStatus: input.row.status,
      now: batchNow,
      animeId: input.row.animeId,
      eventType: "download.imported.batch",
      eventMessage: batchAlreadyImported
        ? `Reconciled already-imported batch torrent for ${input.row.animeTitle}`
        : `Imported batch torrent for ${input.row.animeTitle}`,
      eventMetadata,
      logEventType: "downloads.reconciled.batch",
      logMessage: batchAlreadyImported
        ? `Marked already-imported batch torrent as reconciled for ${input.row.animeTitle}`
        : `Mapped completed batch torrent for ${input.row.animeTitle}`,
      db: input.db,
      tryDatabasePromise: input.tryDatabasePromise,
    });
    yield* input.maybeCleanupImportedTorrent(input.runtimeConfig, input.row.infoHash);
    yield* input.eventBus.publish({
      type: "DownloadFinished",
      payload: {
        anime_id: input.row.animeId,
        imported_path: input.animeRow.rootFolder,
        source_metadata: input.storedSourceMetadata,
        title: input.row.torrentName,
      },
    });

    return true;
  },
);
