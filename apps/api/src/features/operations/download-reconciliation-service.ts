import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import {
  downloadEvents,
  downloads,
  episodes,
  systemLogs,
} from "../../db/schema.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  currentImportMode,
  decodeDownloadSourceMetadata,
  encodeDownloadEventMetadata,
  loadRuntimeConfig,
  requireAnime,
} from "./repository.ts";
import {
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "./naming-support.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import {
  importDownloadedFile,
  shouldDeleteImportedData,
  shouldRemoveTorrentOnImport,
  upsertEpisodeFile,
  upsertEpisodeFilesAtomic,
} from "./download-support.ts";
import { classifyMediaArtifact } from "../../lib/media-identity.ts";
import {
  parseCoveredEpisodes,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
  resolveReconciledBatchEpisodeNumbers,
} from "./download-lifecycle.ts";
import { nowIso } from "./job-support.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  ExternalCallError,
  type OperationsError,
  OperationsPathError,
} from "./errors.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type {
  TryDatabasePromise,
  TryOperationsPromise,
} from "./service-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";

export function makeDownloadReconciliationService(input: {
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly tryOperationsPromise: TryOperationsPromise;
  readonly wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  readonly maybeQBitConfig: (config: Config) => QBitConfig | null;
}) {
  const {
    db,
    fs,
    mediaProbe,
    qbitClient,
    eventBus,
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
    maybeQBitConfig,
  } = input;

  const maybeCleanupImportedTorrent = Effect.fn(
    "OperationsService.maybeCleanupImportedTorrent",
  )(function* (
    config: Config | null | undefined,
    infoHash: string | null,
  ) {
    const qbitConfig = config ? maybeQBitConfig(config) : null;

    if (!qbitConfig || !infoHash || !shouldRemoveTorrentOnImport(config)) {
      return;
    }

    yield* qbitClient.deleteTorrent(
      qbitConfig,
      infoHash,
      shouldDeleteImportedData(config),
    ).pipe(
      Effect.catchTags({
        ExternalCallError: (cause) =>
          Effect.logWarning(
            "Failed to delete imported torrent from qBittorrent",
          )
            .pipe(
              Effect.annotateLogs({
                infoHash,
                error: String(cause),
              }),
            ),
        QBitTorrentClientError: (cause) =>
          Effect.logWarning(
            "Failed to delete imported torrent from qBittorrent",
          )
            .pipe(
              Effect.annotateLogs({
                infoHash,
                error: String(cause),
              }),
            ),
      }),
    );
  });

  const reconcileCompletedTorrentEffect = Effect.fn(
    "OperationsService.reconcileCompletedTorrent",
  )(function* (infoHash: string, contentPath: string | undefined) {
    if (!contentPath) {
      return;
    }

    const rows = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        db.select().from(downloads).where(eq(downloads.infoHash, infoHash))
          .limit(1),
    );
    const row = rows[0];

    if (!row) {
      return;
    }

    if (row.reconciledAt) {
      return;
    }

    const storedSourceMetadata = decodeDownloadSourceMetadata(
      row.sourceMetadata,
    );

    const animeRow = yield* tryOperationsPromise(
      "Failed to reconcile completed download",
      () => requireAnime(db, row.animeId),
    );
    const importMode = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () => currentImportMode(db),
    );
    const runtimeConfig = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () => loadRuntimeConfig(db),
    );
    const resolvedContentRoot = yield* resolveAccessibleDownloadPath(
      fs,
      contentPath,
      runtimeConfig.downloads.remote_path_mappings,
    );

    if (!resolvedContentRoot) {
      return;
    }

    if (row.isBatch) {
      const coveredEpisodes = parseCoveredEpisodes(row.coveredEpisodes);
      const batchPaths = yield* resolveBatchContentPaths(
        fs,
        resolvedContentRoot,
      ).pipe(
        Effect.mapError(() =>
          new OperationsPathError({
            message:
              `Download content path is inaccessible: ${resolvedContentRoot}`,
          })
        ),
      );

      if (batchPaths.length > 0) {
        const accountedEpisodes = new Set<number>();
        const expectedEpisodeCount = coveredEpisodes.length > 0
          ? new Set(coveredEpisodes).size
          : undefined;
        let alreadyImportedCount = 0;
        let importedCount = 0;

        for (const path of batchPaths) {
          const fileName = path.substring(path.lastIndexOf("/") + 1);
          const classification = classifyMediaArtifact(path, fileName);
          if (
            classification.kind === "extra" ||
            classification.kind === "sample"
          ) {
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

          const relevantEpisodes = coveredEpisodes.length > 0
            ? episodeNumbers.filter((ep) => coveredEpisodes.includes(ep))
            : episodeNumbers;

          if (relevantEpisodes.length === 0) {
            continue;
          }

          for (const ep of relevantEpisodes) {
            accountedEpisodes.add(ep);
          }

          const primaryEpisode = relevantEpisodes[0];
          const namingFormat = selectNamingFormat(animeRow, {
            movieNamingFormat: runtimeConfig.library.movie_naming_format,
            namingFormat: runtimeConfig.library.naming_format,
          });
          const episodeRows = yield* tryDatabasePromise(
            "Failed to reconcile completed download",
            () =>
              db.select({ aired: episodes.aired, title: episodes.title }).from(
                episodes,
              ).where(
                and(
                  eq(episodes.animeId, row.animeId),
                  inArray(episodes.number, relevantEpisodes),
                ),
              ),
          );
          const initialNamingPlan = buildEpisodeFilenamePlan({
            animeRow,
            downloadSourceMetadata: storedSourceMetadata,
            episodeNumbers: relevantEpisodes,
            episodeRows,
            filePath: path,
            namingFormat,
            preferredTitle: runtimeConfig.library.preferred_title,
          });
          const localMediaMetadata = hasMissingLocalMediaNamingFields(
              initialNamingPlan.missingFields,
            )
            ? yield* mediaProbe.probeVideoFile(path)
            : undefined;

          const existingEpisode = yield* tryDatabasePromise(
            "Failed to reconcile completed download",
            () =>
              db.select().from(episodes).where(
                and(
                  eq(episodes.animeId, row.animeId),
                  eq(episodes.number, primaryEpisode),
                ),
              ).limit(1),
          );

          if (existingEpisode[0]?.downloaded && existingEpisode[0]?.filePath) {
            alreadyImportedCount += 1;
            continue;
          }

          const managedPath = yield* importDownloadedFile(
            fs,
            animeRow,
            primaryEpisode,
            path,
            importMode,
            {
              downloadSourceMetadata: storedSourceMetadata,
              episodeNumbers: relevantEpisodes,
              episodeRows,
              localMediaMetadata,
              namingFormat,
              preferredTitle: runtimeConfig.library.preferred_title,
            },
          ).pipe(
            Effect.mapError(
              wrapOperationsError("Failed to reconcile completed download"),
            ),
          );
          yield* tryDatabasePromise(
            "Failed to reconcile completed download",
            () =>
              upsertEpisodeFilesAtomic(
                db,
                row.animeId,
                relevantEpisodes,
                managedPath,
              ),
          );
          importedCount += 1;
        }

        const batchAlreadyImported = importedCount === 0 &&
          accountedEpisodes.size > 0 &&
          alreadyImportedCount === accountedEpisodes.size &&
          (
            expectedEpisodeCount === undefined ||
            accountedEpisodes.size === expectedEpisodeCount
          );

        if (importedCount === 0 && !batchAlreadyImported) {
          yield* Effect.logWarning(
            "Batch reconciliation skipped all files; leaving unreconciled for retry",
          ).pipe(
            Effect.annotateLogs({
              animeTitle: row.animeTitle,
              downloadId: row.id,
            }),
          );
          return;
        }

        yield* tryDatabasePromise(
          "Failed to reconcile completed download",
          async () => {
            await db.transaction(async (tx) => {
              await tx.update(downloads).set({
                externalState: "imported",
                progress: 100,
                status: "imported",
              }).where(eq(downloads.id, row.id));
              await tx.update(downloads).set({ reconciledAt: nowIso() }).where(
                eq(downloads.id, row.id),
              );
              await tx.insert(downloadEvents).values({
                animeId: row.animeId,
                createdAt: nowIso(),
                downloadId: row.id,
                eventType: "download.imported.batch",
                fromStatus: row.status,
                message: batchAlreadyImported
                  ? `Reconciled already-imported batch torrent for ${row.animeTitle}`
                  : `Imported batch torrent for ${row.animeTitle}`,
                metadata: encodeDownloadEventMetadata({
                  covered_episodes: parseCoveredEpisodes(row.coveredEpisodes),
                  imported_path: animeRow.rootFolder,
                  source_metadata: storedSourceMetadata,
                }),
                toStatus: "imported",
              });
              await tx.insert(systemLogs).values({
                createdAt: nowIso(),
                details: null,
                eventType: "downloads.reconciled.batch",
                level: "success",
                message: batchAlreadyImported
                  ? `Marked already-imported batch torrent as reconciled for ${row.animeTitle}`
                  : `Mapped completed batch torrent for ${row.animeTitle}`,
              });
            });
          },
        );
        yield* maybeCleanupImportedTorrent(runtimeConfig, row.infoHash);
        yield* eventBus.publish({
          type: "DownloadFinished",
          payload: {
            anime_id: row.animeId,
            imported_path: animeRow.rootFolder,
            source_metadata: storedSourceMetadata,
            title: row.torrentName,
          },
        });
        return;
      }
    }

    const existingEpisode = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        db.select().from(episodes).where(
          and(
            eq(episodes.animeId, row.animeId),
            eq(episodes.number, row.episodeNumber),
          ),
        ).limit(1),
    );

    if (existingEpisode[0]?.downloaded && existingEpisode[0]?.filePath) {
      yield* tryDatabasePromise(
        "Failed to reconcile completed download",
        async () => {
          await db.transaction(async (tx) => {
            await tx.update(downloads).set({
              externalState: "imported",
              progress: 100,
              status: "imported",
            }).where(eq(downloads.id, row.id));
            await tx.update(downloads).set({ reconciledAt: nowIso() }).where(
              eq(downloads.id, row.id),
            );
          });
        },
      );
      return;
    }

    const expectedAirDate = existingEpisode[0]?.aired ??
      storedSourceMetadata?.air_date ??
      (storedSourceMetadata?.source_identity?.scheme === "daily"
        ? storedSourceMetadata.source_identity.air_dates?.[0]
        : undefined);

    const resolvedPath = yield* resolveCompletedContentPath(
      fs,
      resolvedContentRoot,
      row.episodeNumber,
      { expectedAirDate },
    ).pipe(
      Effect.mapError(() =>
        new OperationsPathError({
          message:
            `Download content path is inaccessible: ${resolvedContentRoot}`,
        })
      ),
    );

    if (!resolvedPath) {
      return;
    }

    const namingFormat = selectNamingFormat(animeRow, {
      movieNamingFormat: runtimeConfig.library.movie_naming_format,
      namingFormat: runtimeConfig.library.naming_format,
    });
    const episodeRows = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        db.select({ aired: episodes.aired, title: episodes.title }).from(
          episodes,
        ).where(
          and(
            eq(episodes.animeId, row.animeId),
            eq(episodes.number, row.episodeNumber),
          ),
        ),
    );
    const initialNamingPlan = buildEpisodeFilenamePlan({
      animeRow,
      downloadSourceMetadata: storedSourceMetadata,
      episodeNumbers: [row.episodeNumber],
      episodeRows,
      filePath: resolvedPath,
      namingFormat,
      preferredTitle: runtimeConfig.library.preferred_title,
    });
    const localMediaMetadata = hasMissingLocalMediaNamingFields(
        initialNamingPlan.missingFields,
      )
      ? yield* mediaProbe.probeVideoFile(resolvedPath)
      : undefined;

    const managedPath = yield* importDownloadedFile(
      fs,
      animeRow,
      row.episodeNumber,
      resolvedPath,
      importMode,
      {
        downloadSourceMetadata: storedSourceMetadata,
        episodeRows,
        localMediaMetadata,
        namingFormat,
        preferredTitle: runtimeConfig.library.preferred_title,
      },
    ).pipe(
      Effect.mapError(
        wrapOperationsError("Failed to reconcile completed download"),
      ),
    );
    yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () => upsertEpisodeFile(db, row.animeId, row.episodeNumber, managedPath),
    );
    yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      async () => {
        await db.transaction(async (tx) => {
          await tx.update(downloads).set({
            externalState: "imported",
            progress: 100,
            status: "imported",
          }).where(eq(downloads.id, row.id));
          await tx.update(downloads).set({ reconciledAt: nowIso() }).where(
            eq(downloads.id, row.id),
          );
          await tx.insert(downloadEvents).values({
            animeId: row.animeId,
            createdAt: nowIso(),
            downloadId: row.id,
            eventType: "download.imported",
            fromStatus: row.status,
            message: `Imported ${row.animeTitle} episode ${row.episodeNumber}`,
            metadata: encodeDownloadEventMetadata({
              covered_episodes: parseCoveredEpisodes(row.coveredEpisodes),
              imported_path: managedPath,
              source_metadata: storedSourceMetadata,
            }),
            toStatus: "imported",
          });
          await tx.insert(systemLogs).values({
            createdAt: nowIso(),
            details: null,
            eventType: "downloads.reconciled",
            level: "success",
            message:
              `Mapped completed torrent for ${row.animeTitle} episode ${row.episodeNumber}`,
          });
        });
      },
    );
    yield* maybeCleanupImportedTorrent(runtimeConfig, row.infoHash);
    yield* eventBus.publish({
      type: "DownloadFinished",
      payload: {
        anime_id: row.animeId,
        imported_path: managedPath,
        source_metadata: storedSourceMetadata,
        title: row.torrentName,
      },
    });
  });

  const reconcileDownloadByIdEffect = Effect.fn(
    "OperationsService.reconcileDownloadById",
  )(function* (id: number) {
    const rows = yield* tryDatabasePromise(
      "Failed to reconcile download",
      () => db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
    );
    const row = rows[0];

    if (!row) {
      return yield* new DownloadNotFoundError({
        message: "Download not found",
      });
    }

    const contentPath = row.contentPath ?? row.savePath;

    if (!contentPath || !row.infoHash) {
      return yield* new DownloadConflictError({
        message: "Download has no reconciliable content path",
      });
    }

    yield* reconcileCompletedTorrentEffect(
      row.infoHash,
      contentPath ?? undefined,
    );
  });

  return {
    maybeCleanupImportedTorrent,
    reconcileCompletedTorrentEffect,
    reconcileDownloadByIdEffect,
  };
}
