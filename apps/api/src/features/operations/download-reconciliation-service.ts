import type { Config } from "../../../../../packages/shared/src/index.ts";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { EventBus } from "../events/event-bus.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { makeDownloadCompletedTorrentReconciliation } from "./download-reconciliation-completed-torrent.ts";
import { makeReconcileDownloadByIdEffect } from "./download-reconciliation-lookup.ts";

export function makeDownloadReconciliationService(input: {
  readonly db: AppDatabase;
  readonly fs: import("../../lib/filesystem.ts").FileSystemShape;
  readonly mediaProbe: import("../../lib/media-probe.ts").MediaProbeShape;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: import("../../lib/effect-db.ts").TryDatabasePromise;
  readonly maybeQBitConfig: (config: Config) => import("./qbittorrent.ts").QBitConfig | null;
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
