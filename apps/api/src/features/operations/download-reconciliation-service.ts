import type { Config } from "@packages/shared/index.ts";
import { Context, Effect, Layer } from "effect";

import { Database, type AppDatabase } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { RandomService } from "@/lib/random.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { makeDownloadCompletedTorrentReconciliation } from "@/features/operations/download-reconciliation-completed-torrent.ts";
import { makeReconcileDownloadByIdEffect } from "@/features/operations/download-reconciliation-lookup.ts";
import { tryDatabasePromise, type TryDatabasePromise } from "@/lib/effect-db.ts";
import type { QBitConfig } from "@/features/operations/qbittorrent.ts";
import { maybeQBitConfig } from "@/features/operations/operations-qbit-config.ts";

export type DownloadReconciliationServiceShape = ReturnType<
  typeof makeDownloadReconciliationService
>;

export class DownloadReconciliationService extends Context.Tag(
  "@bakarr/api/DownloadReconciliationService",
)<DownloadReconciliationService, DownloadReconciliationServiceShape>() {}

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

export const DownloadReconciliationServiceLive = Layer.effect(
  DownloadReconciliationService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;
    const qbitClient = yield* QBitTorrentClient;
    const clock = yield* ClockService;
    const random = yield* RandomService;

    return makeDownloadReconciliationService({
      db,
      eventBus,
      fs,
      mediaProbe,
      maybeQBitConfig,
      nowIso: () => nowIsoFromClock(clock),
      qbitClient,
      randomUuid: () => random.randomUuid,
      tryDatabasePromise,
    });
  }),
);
