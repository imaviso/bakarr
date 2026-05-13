import {
  makeDownloadTorrentActionSupport,
  type DownloadTorrentActionSupportShape,
} from "@/features/operations/download-torrent-action-support.ts";
import {
  makeDownloadTorrentSyncSupport,
  type DownloadTorrentSyncSupportShape,
} from "@/features/operations/download-torrent-sync-support.ts";
import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { DownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";

export type DownloadTorrentLifecycleServiceShape = DownloadTorrentActionSupportShape &
  DownloadTorrentSyncSupportShape;

export class DownloadTorrentLifecycleService extends Context.Tag(
  "@bakarr/api/DownloadTorrentLifecycleService",
)<DownloadTorrentLifecycleService, DownloadTorrentLifecycleServiceShape>() {}

export const DownloadTorrentLifecycleServiceLive = Layer.effect(
  DownloadTorrentLifecycleService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const torrentClientService = yield* TorrentClientService;
    const clock = yield* ClockService;
    const reconciliationService = yield* DownloadReconciliationService;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    const input = {
      db,
      getRuntimeConfig: runtimeConfigSnapshot.getRuntimeConfig,
      nowIso: () => nowIsoFromClock(clock),
      torrentClientService,
      reconcileCompletedTorrentEffect: reconciliationService.reconcileCompletedTorrentEffect,
      tryDatabasePromise,
    };

    return {
      ...makeDownloadTorrentActionSupport(input),
      ...makeDownloadTorrentSyncSupport(input),
    } satisfies DownloadTorrentLifecycleServiceShape;
  }),
);
