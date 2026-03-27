import type { Config } from "../../../../../packages/shared/src/index.ts";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { downloads } from "../../db/schema.ts";
import type { ExternalCallError } from "../../lib/effect-retry.ts";
import { EventBus } from "../events/event-bus.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { DownloadConflictError, DownloadNotFoundError, type OperationsError } from "./errors.ts";
import { makeDownloadCompletedTorrentReconciliation } from "./download-reconciliation-completed-torrent.ts";

export function makeDownloadReconciliationService(input: {
  readonly db: AppDatabase;
  readonly fs: import("../../lib/filesystem.ts").FileSystemShape;
  readonly mediaProbe: import("../../lib/media-probe.ts").MediaProbeShape;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: import("../../lib/effect-db.ts").TryDatabasePromise;
  readonly wrapOperationsError: (
    message: string,
  ) => (
    cause: unknown,
  ) => ExternalCallError | OperationsError | import("../../db/database.ts").DatabaseError;
  readonly maybeQBitConfig: (config: Config) => import("./qbittorrent.ts").QBitConfig | null;
  readonly nowIso: () => Effect.Effect<string>;
  readonly randomUuid: () => Effect.Effect<string>;
}) {
  const { db, tryDatabasePromise } = input;
  const { reconcileCompletedTorrentEffect, maybeCleanupImportedTorrent } =
    makeDownloadCompletedTorrentReconciliation(input);

  const reconcileDownloadByIdEffect = Effect.fn("OperationsService.reconcileDownloadById")(
    function* (id: number) {
      const rows = yield* tryDatabasePromise("Failed to reconcile download", () =>
        db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
      );
      const [row] = rows;

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

      yield* reconcileCompletedTorrentEffect(row.infoHash, contentPath ?? undefined);
    },
  );

  return {
    maybeCleanupImportedTorrent,
    reconcileCompletedTorrentEffect,
    reconcileDownloadByIdEffect,
  };
}
