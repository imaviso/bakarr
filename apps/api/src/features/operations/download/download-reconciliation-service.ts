import { Context, Effect, Layer } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { makeDownloadCompletedTorrentReconciliation } from "@/features/operations/download/download-reconciliation-completed-torrent.ts";
import { makeReconcileDownloadByIdEffect } from "@/features/operations/download/download-reconciliation-lookup.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import type {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsError,
} from "@/features/operations/errors.ts";
import type { MaybeCleanupImportedTorrent } from "@/features/operations/download/download-reconciliation-shared.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export interface DownloadReconciliationServiceShape {
  readonly maybeCleanupImportedTorrent: MaybeCleanupImportedTorrent;
  readonly reconcileCompletedTorrentEffect: (
    infoHash: string,
    contentPath: string | undefined,
  ) => Effect.Effect<
    void,
    ExternalCallError | OperationsError | DatabaseError | RuntimeConfigSnapshotError
  >;
  readonly reconcileDownloadByIdEffect: (
    id: number,
  ) => Effect.Effect<
    void,
    | DownloadConflictError
    | DownloadNotFoundError
    | ExternalCallError
    | OperationsError
    | DatabaseError
    | RuntimeConfigSnapshotError
  >;
}

export class DownloadReconciliationService extends Context.Tag(
  "@bakarr/api/DownloadReconciliationService",
)<DownloadReconciliationService, DownloadReconciliationServiceShape>() {}

export const DownloadReconciliationServiceLive = Layer.effect(
  DownloadReconciliationService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;
    const torrentClientService = yield* TorrentClientService;
    const clock = yield* ClockService;
    const random = yield* RandomService;
    const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;
    const nowIso = () => nowIsoFromClock(clock);
    const randomUuid = () => random.randomUuid;

    const { reconcileCompletedTorrentEffect, maybeCleanupImportedTorrent } =
      makeDownloadCompletedTorrentReconciliation(
        db,
        fs,
        mediaProbe,
        torrentClientService,
        eventBus,
        tryDatabasePromise,
        nowIso,
        randomUuid,
        runtimeConfigSnapshotService.getRuntimeConfig,
      );
    const reconcileDownloadByIdEffect = makeReconcileDownloadByIdEffect({
      db,
      reconcileCompletedTorrentEffect,
      tryDatabasePromise,
    });

    return DownloadReconciliationService.of({
      maybeCleanupImportedTorrent,
      reconcileCompletedTorrentEffect,
      reconcileDownloadByIdEffect,
    });
  }),
);
