import type { Config } from "@packages/shared/index.ts";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { makeDownloadCompletedTorrentReconciliation } from "@/features/operations/download-reconciliation-completed-torrent.ts";
import { makeReconcileDownloadByIdEffect } from "@/features/operations/download-reconciliation-lookup.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import type { QBitConfig } from "@/features/operations/qbittorrent.ts";

export function makeDownloadReconciliationService(input: {
  readonly db: AppDatabase;
  readonly fs: import("@/lib/filesystem.ts").FileSystemShape;
  readonly mediaProbe: import("@/lib/media-probe.ts").MediaProbeShape;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly maybeQBitConfig: (config: Config) => QBitConfig | null;
  readonly nowIso: () => Effect.Effect<string>;
  readonly randomUuid: () => Effect.Effect<string>;
}) {
  const { db, tryDatabasePromise } = input;
  const { reconcileCompletedTorrentEffect, maybeCleanupImportedTorrent } =
    makeDownloadCompletedTorrentReconciliation(input);
  const reconcileDownloadByIdEffect = makeReconcileDownloadByIdEffect({
    db,
    reconcileCompletedTorrentEffect,
    tryDatabasePromise,
  });

  return {
    maybeCleanupImportedTorrent,
    reconcileCompletedTorrentEffect,
    reconcileDownloadByIdEffect,
  };
}
