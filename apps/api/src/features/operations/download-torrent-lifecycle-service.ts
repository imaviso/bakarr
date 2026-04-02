import {
  makeDownloadTorrentActionSupport,
  type DownloadTorrentActionSupportShape,
} from "@/features/operations/download-torrent-action-support.ts";
import {
  makeDownloadTorrentSyncSupport,
  type DownloadTorrentSyncSupportInput,
  type DownloadTorrentSyncSupportShape,
} from "@/features/operations/download-torrent-sync-support.ts";
import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { DownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";

export type DownloadTorrentLifecycleServiceShape = DownloadTorrentActionSupportShape &
  DownloadTorrentSyncSupportShape;

export class DownloadTorrentLifecycleService extends Context.Tag(
  "@bakarr/api/DownloadTorrentLifecycleService",
)<DownloadTorrentLifecycleService, DownloadTorrentLifecycleServiceShape>() {}

export type DownloadTorrentLifecycleServiceInput = DownloadTorrentSyncSupportInput;

export function makeDownloadTorrentLifecycleService(input: DownloadTorrentLifecycleServiceInput) {
  const actionSupport = makeDownloadTorrentActionSupport(input);
  const syncSupport = makeDownloadTorrentSyncSupport(input);

  return {
    ...actionSupport,
    ...syncSupport,
  } satisfies DownloadTorrentLifecycleServiceShape;
}

export const DownloadTorrentLifecycleServiceLive = Layer.effect(
  DownloadTorrentLifecycleService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const torrentClientService = yield* TorrentClientService;
    const clock = yield* ClockService;
    const reconciliationService = yield* DownloadReconciliationService;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    return makeDownloadTorrentLifecycleService({
      db,
      getRuntimeConfig: runtimeConfigSnapshot.getRuntimeConfig,
      nowIso: () => nowIsoFromClock(clock),
      torrentClientService,
      reconcileCompletedTorrentEffect: reconciliationService.reconcileCompletedTorrentEffect,
      tryDatabasePromise,
    });
  }),
);
