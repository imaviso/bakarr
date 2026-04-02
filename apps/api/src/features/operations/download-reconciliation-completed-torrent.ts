import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
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
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export function makeDownloadCompletedTorrentReconciliation(input: {
  readonly db: AppDatabase;
  readonly fs: import("@/lib/filesystem.ts").FileSystemShape;
  readonly mediaProbe: import("@/lib/media-probe.ts").MediaProbeShape;
  readonly torrentClientService: typeof TorrentClientService.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: import("@/lib/effect-db.ts").TryDatabasePromise;
  readonly nowIso: () => Effect.Effect<string>;
  readonly randomUuid: () => Effect.Effect<string>;
  readonly getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>;
}) {
  const { db, fs, mediaProbe, eventBus, tryDatabasePromise, torrentClientService } = input;
  const { nowIso } = input;
  const { randomUuid } = input;

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
          Effect.catchAll((cause) =>
            Effect.logWarning("Failed to delete imported torrent from qBittorrent").pipe(
              Effect.annotateLogs({
                infoHash,
                error: String(cause),
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
        getRuntimeConfig: input.getRuntimeConfig,
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
