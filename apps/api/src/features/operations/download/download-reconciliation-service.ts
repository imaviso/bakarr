import { Cause, Effect, Option } from "effect";
import { and, eq, isNull } from "drizzle-orm";

import type { Config } from "@packages/shared/index.ts";
import { AppDrizzleDatabase } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import {
  loadDownloadReconciliationContext,
  reconcileBatchDownloadEffect,
  reconcileSingleDownloadEffect,
  type ReconcileByIdError,
  type ReconcileCompletedError,
} from "@/features/operations/download/download-reconciliation.ts";
import {
  shouldDeleteImportedData,
  shouldRemoveTorrentOnImport,
} from "@/features/operations/download/download-reconciliation-policy.ts";
import { OperationsConflictError, OperationsNotFoundError } from "@/features/operations/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";

export interface DownloadReconciliationServiceShape {
  readonly maybeCleanupImportedTorrent: (
    config: Config | null | undefined,
    infoHash: string | null,
  ) => Effect.Effect<void>;
  readonly reconcileCompletedTorrentEffect: (
    infoHash: string,
    contentPath: string | undefined,
  ) => Effect.Effect<void, ReconcileCompletedError>;
  readonly reconcileDownloadByIdEffect: (id: number) => Effect.Effect<void, ReconcileByIdError>;
}

export class DownloadReconciliationService extends Effect.Service<DownloadReconciliationService>()(
  "@bakarr/api/DownloadReconciliationService",
  {
    // Platform/FS/torrent/progress provided by ops feature layer; list pure leaves only.
    dependencies: [
      AppDrizzleDatabase.Default,
      DownloadRepository.Default,
      EventBus.Default,
      MediaRepository.Default,
      MediaUnitRepository.Default,
      RandomService.Default,
    ],
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const repo = yield* DownloadRepository;
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaProbe = yield* MediaProbe;
      const mediaRepository = yield* MediaRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const torrentClientService = yield* TorrentClientService;
      const progress = yield* OperationsProgress;
      const random = yield* RandomService;
      const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;
      const nowIso = currentNowIso;
      const randomUuid = () => random.randomUuid;
      const getRuntimeConfig = runtimeConfigSnapshotService.getRuntimeConfig;

      const maybeCleanupImportedTorrent = Effect.fn(
        "DownloadReconcile.maybeCleanupImportedTorrent",
      )(function* (config: Config | null | undefined, infoHash: string | null) {
        if (!infoHash || !shouldRemoveTorrentOnImport(config)) {
          return;
        }

        yield* torrentClientService
          .deleteTorrentIfEnabled(infoHash, shouldDeleteImportedData(config))
          .pipe(
            Effect.flatMap((result) =>
              result._tag === "Disabled"
                ? Effect.logDebug("Skipped qBittorrent cleanup because it is disabled")
                : Effect.void,
            ),
            Effect.catchAllCause((cause) =>
              Effect.logWarning("Failed to delete imported torrent from qBittorrent").pipe(
                Effect.annotateLogs({
                  infoHash,
                  cause: Cause.pretty(cause),
                }),
              ),
            ),
          );
        return;
      });

      // Atomic claim: only one concurrent reconcile may import a given download.
      // The token marks an in-flight claim; finalization overwrites it with a timestamp,
      // so a leftover token always means the claim must be released for retry.
      const claimDownloadReconcile = Effect.fn("DownloadReconcile.claimDownloadReconcile")(
        function* (infoHash: string, claimToken: string) {
          const claimedRows = yield* tryDatabasePromise(
            "Failed to claim download reconciliation",
            () =>
              db
                .update(downloads)
                .set({ reconciledAt: claimToken })
                .where(and(eq(downloads.infoHash, infoHash), isNull(downloads.reconciledAt)))
                .returning({ id: downloads.id }),
          );

          return claimedRows.length > 0;
        },
      );

      const releaseDownloadReconcileClaim = (downloadId: number, claimToken: string) =>
        tryDatabasePromise("Failed to release download reconciliation claim", () =>
          db
            .update(downloads)
            .set({ reconciledAt: null })
            .where(and(eq(downloads.id, downloadId), eq(downloads.reconciledAt, claimToken))),
        ).pipe(Effect.ignoreLogged);

      const reconcileCompletedTorrentEffect = Effect.fn(
        "DownloadReconcile.reconcileCompletedTorrent",
      )(function* (infoHash: string, contentPath: string | undefined) {
        if (!contentPath) {
          return;
        }

        const row = yield* repo.loadDownloadByInfoHash(infoHash);
        if (!row || row.reconciledAt) {
          return;
        }

        const claimToken = yield* randomUuid();
        const claimed = yield* claimDownloadReconcile(infoHash, claimToken);
        if (!claimed) {
          return;
        }

        yield* Effect.gen(function* () {
          const context = yield* loadDownloadReconciliationContext({
            repo,
            mediaUnitRepository,
            eventBus,
            fs,
            mediaProbe,
            maybeCleanupImportedTorrent,
            nowIso,
            randomUuid,
            row,
            contentPath,
            getRuntimeConfig,
            mediaRepository,
          });

          if (Option.isNone(context)) {
            return;
          }

          if (context.value.row.isBatch) {
            const handledBatch = yield* reconcileBatchDownloadEffect(context.value);
            if (handledBatch) {
              return;
            }
          }

          yield* reconcileSingleDownloadEffect(context.value);
        }).pipe(Effect.onExit(() => releaseDownloadReconcileClaim(row.id, claimToken)));
      });

      const reconcileDownloadByIdEffect = Effect.fn(
        "DownloadReconcileService.reconcileDownloadById",
      )(function* (id: number) {
        const row = yield* repo.loadDownloadById(id);

        if (!row) {
          yield* new OperationsNotFoundError({
            message: "Download not found",
          });
          return;
        }

        const contentPath = row.contentPath ?? row.savePath;

        if (!contentPath || !row.infoHash) {
          yield* new OperationsConflictError({
            message: "Download has no reconciliable content path",
          });
          return;
        }

        yield* reconcileCompletedTorrentEffect(row.infoHash, contentPath);
        yield* progress.publishDownloadProgressNow();
        yield* eventBus.publishInfo(`Reconciled download ${id}`);
      });

      return {
        maybeCleanupImportedTorrent,
        reconcileCompletedTorrentEffect,
        reconcileDownloadByIdEffect,
      } satisfies DownloadReconciliationServiceShape;
    }),
  },
) {}

export const DownloadReconciliationServiceLive = DownloadReconciliationService.Default;
