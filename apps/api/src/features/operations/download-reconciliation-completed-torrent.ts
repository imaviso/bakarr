import { eq } from "drizzle-orm";
import { Cause, Effect, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import {
  loadDownloadReconciliationContext,
  type DownloadReconciliationContext,
  type MaybeCleanupImportedTorrent,
} from "@/features/operations/download-reconciliation-shared.ts";
import { reconcileBatchDownloadEffect } from "@/features/operations/download-reconciliation-batch.ts";
import { reconcileSingleDownloadEffect } from "@/features/operations/download-reconciliation-single.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";

function shouldRemoveTorrentOnImport(config: Config | null | undefined) {
  return config?.downloads.remove_torrent_on_import ?? true;
}

function shouldDeleteImportedData(config: Config | null | undefined) {
  return config?.downloads.delete_download_files_after_import ?? false;
}

export function makeDownloadCompletedTorrentReconciliation(
  db: AppDatabase,
  fs: FileSystemShape,
  mediaProbe: MediaProbeShape,
  torrentClientService: typeof TorrentClientService.Service,
  eventBus: typeof EventBus.Service,
  tryDatabasePromise: TryDatabasePromise,
  nowIso: () => Effect.Effect<string>,
  randomUuid: () => Effect.Effect<string>,
  getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>,
) {
  const maybeCleanupImportedTorrent = Effect.fn("OperationsService.maybeCleanupImportedTorrent")(
    function* (config: Config | null | undefined, infoHash: string | null) {
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
    },
  );

  const reconcileCompletedTorrentEffect = Effect.fn("OperationsService.reconcileCompletedTorrent")(
    function* (infoHash: string, contentPath: string | undefined) {
      if (!contentPath) {
        return;
      }

      const rows = yield* tryDatabasePromise("Failed to reconcile completed download", () =>
        db.select().from(downloads).where(eq(downloads.infoHash, infoHash)).limit(1),
      );
      const [row] = rows;

      if (!row) {
        return;
      }

      if (row.reconciledAt) {
        return;
      }

      const context = yield* loadDownloadReconciliationContext({
        db,
        eventBus,
        fs,
        mediaProbe,
        maybeCleanupImportedTorrent,
        nowIso,
        randomUuid,
        row,
        tryDatabasePromise,
        contentPath,
        getRuntimeConfig,
      });

      if (Option.isNone(context)) {
        return;
      }
      const contextValue: DownloadReconciliationContext = context.value;

      if (contextValue.row.isBatch) {
        const handledBatch = yield* reconcileBatchDownloadEffect(contextValue);
        if (handledBatch) {
          return;
        }
      }

      yield* reconcileSingleDownloadEffect(contextValue);
    },
  );

  return {
    maybeCleanupImportedTorrent,
    reconcileCompletedTorrentEffect,
  } satisfies {
    readonly maybeCleanupImportedTorrent: MaybeCleanupImportedTorrent;
    readonly reconcileCompletedTorrentEffect: typeof reconcileCompletedTorrentEffect;
  };
}
