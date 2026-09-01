import { Cause, Effect, Option, Ref } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { TorrentClientService } from "@/features/operations/torrent/torrent-client-service.ts";
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
import { buildClaimToken } from "@/features/operations/download/download-claim-token.ts";
import { OperationsConflictError, OperationsNotFoundError } from "@/features/operations/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";

export interface DownloadReconciliationServiceShape {
  readonly maybeCleanupImportedTorrent: (
    config: Config | null | undefined,
    infoHash: string | null,
  ) => Effect.Effect<void>;
  /**
   * Whether this process currently holds a live reconciliation claim for the
   * download. The sync pass consults it before sweeping stale claims so a
   * long-running import (slow storage can exceed any fixed threshold) is
   * never released mid-flight.
   */
  readonly hasLiveReconciliationClaim: (downloadId: number) => Effect.Effect<boolean>;
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
      DownloadRepository.Default,
      EventBus.Default,
      MediaRepository.Default,
      MediaUnitRepository.Default,
      RandomService.Default,
    ],
    effect: Effect.gen(function* () {
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
      // Process-local registry of downloads with an in-flight reconcile claim.
      // The claim token's embedded timestamp stays the crash-orphan signal;
      // this set is what distinguishes "orphaned" from "still importing".
      const liveClaimIds = yield* Ref.make(new Set<number>());

      const hasLiveReconciliationClaim: DownloadReconciliationServiceShape["hasLiveReconciliationClaim"] =
        (downloadId) => Effect.map(Ref.get(liveClaimIds), (ids) => ids.has(downloadId));

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
                ? Effect.logDebug("Skipped torrent client cleanup because it is disabled")
                : Effect.void,
            ),
            Effect.catchAllCause((cause) =>
              Effect.logWarning("Failed to delete imported torrent").pipe(
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
      // The token (`claim:<isotimestamp>:<uuid>`) marks an in-flight claim;
      // finalization overwrites it with a timestamp, so a leftover token always
      // means the claim must be released for retry. The embedded timestamp lets
      // the sync pass sweep claims orphaned by a hard crash.
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

        const claimNow = yield* nowIso();
        const claimToken = buildClaimToken(claimNow, yield* randomUuid());
        const unmarkLiveSet = Ref.update(liveClaimIds, (ids) => {
          const next = new Set(ids);
          next.delete(row.id);
          return next;
        });
        // Mark live before the DB claim to close the window where the sync
        // sweep could see a stale-token row before this fiber's live set is
        // populated. The onExit below spans mark + claim too: an interrupt in
        // that span must still unmark the live set, or the sweep would skip a
        // stale claim until restart. Losing the claim race removes the mark
        // inline; a won claim stays (the import block below owns its release).
        const claimed = yield* Ref.update(liveClaimIds, (ids) => new Set(ids).add(row.id)).pipe(
          Effect.zipRight(repo.claimDownloadReconciliation(row.id, claimToken)),
          Effect.onExit((exit) =>
            exit._tag === "Failure" ? unmarkLiveSet.pipe(Effect.ignoreLogged) : Effect.void,
          ),
        );
        if (!claimed) {
          yield* unmarkLiveSet.pipe(Effect.ignoreLogged);
          return;
        }

        yield* Effect.gen(function* () {
          const context = yield* loadDownloadReconciliationContext({
            claimToken,
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
        }).pipe(
          Effect.onExit(() =>
            unmarkLiveSet.pipe(
              Effect.zipRight(
                repo.releaseDownloadReconciliationClaim({ downloadId: row.id, claimToken }),
              ),
              Effect.ignoreLogged,
            ),
          ),
        );
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
        hasLiveReconciliationClaim,
        maybeCleanupImportedTorrent,
        reconcileCompletedTorrentEffect,
        reconcileDownloadByIdEffect,
      } satisfies DownloadReconciliationServiceShape;
    }),
  },
) {}

export const DownloadReconciliationServiceLive = DownloadReconciliationService.Default;
