import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import {
  shouldDeleteImportedData,
  shouldRemoveTorrentOnImport,
} from "@/features/operations/download-support.ts";
import {
  loadDownloadReconciliationContext,
  type DownloadReconciliationContext,
  type MaybeCleanupImportedTorrent,
} from "@/features/operations/download-reconciliation-shared.ts";
import { reconcileBatchDownloadEffect } from "@/features/operations/download-reconciliation-batch.ts";
import { reconcileSingleDownloadEffect } from "@/features/operations/download-reconciliation-single.ts";

export function makeDownloadCompletedTorrentReconciliation(input: {
  readonly db: AppDatabase;
  readonly fs: import("@/lib/filesystem.ts").FileSystemShape;
  readonly mediaProbe: import("@/lib/media-probe.ts").MediaProbeShape;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: import("@/lib/effect-db.ts").TryDatabasePromise;
  readonly maybeQBitConfig: (config: Config) => import("./qbittorrent.ts").QBitConfig | null;
  readonly nowIso: () => Effect.Effect<string>;
  readonly randomUuid: () => Effect.Effect<string>;
}) {
  const {
    db,
    fs,
    mediaProbe,
    qbitClient,
    eventBus,
    tryDatabasePromise,
    maybeQBitConfig: maybeQBitConfigFromInput,
  } = input;
  const { nowIso } = input;
  const { randomUuid } = input;

  const maybeCleanupImportedTorrent = Effect.fn("OperationsService.maybeCleanupImportedTorrent")(
    function* (config: Config | null | undefined, infoHash: string | null) {
      const qbitConfig = config ? maybeQBitConfigFromInput(config) : null;

      if (!qbitConfig || !infoHash || !shouldRemoveTorrentOnImport(config)) {
        return;
      }

      yield* qbitClient.deleteTorrent(qbitConfig, infoHash, shouldDeleteImportedData(config)).pipe(
        Effect.catchTags({
          ExternalCallError: (cause) =>
            Effect.logWarning("Failed to delete imported torrent from qBittorrent").pipe(
              Effect.annotateLogs({
                infoHash,
                error: String(cause),
              }),
            ),
          QBitTorrentClientError: (cause) =>
            Effect.logWarning("Failed to delete imported torrent from qBittorrent").pipe(
              Effect.annotateLogs({
                infoHash,
                error: String(cause),
              }),
            ),
        }),
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

      const context: DownloadReconciliationContext | null =
        yield* loadDownloadReconciliationContext({
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
        });

      if (!context) {
        return;
      }

      if (context.row.isBatch) {
        const handledBatch = yield* reconcileBatchDownloadEffect(context);
        if (handledBatch) {
          return;
        }
      }

      yield* reconcileSingleDownloadEffect(context);
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
