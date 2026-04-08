import type { Config } from "@packages/shared/index.ts";
import { Context, Effect, Layer } from "effect";

import { Database, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { RandomService } from "@/lib/random.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import { makeDownloadCompletedTorrentReconciliation } from "@/features/operations/download-reconciliation-completed-torrent.ts";
import { makeReconcileDownloadByIdEffect } from "@/features/operations/download-reconciliation-lookup.ts";
import { tryDatabasePromise, type TryDatabasePromise } from "@/lib/effect-db.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import type {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsError,
} from "@/features/operations/errors.ts";
import type { MaybeCleanupImportedTorrent } from "@/features/operations/download-reconciliation-shared.ts";
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

export function makeDownloadReconciliationService(input: {
  readonly db: AppDatabase;
  readonly fs: import("@/lib/filesystem.ts").FileSystemShape;
  readonly mediaProbe: import("@/lib/media-probe.ts").MediaProbeShape;
  readonly torrentClientService: typeof TorrentClientService.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly nowIso: () => Effect.Effect<string>;
  readonly randomUuid: () => Effect.Effect<string>;
  readonly getRuntimeConfig: () => Effect.Effect<
    Config,
    import("@/features/system/runtime-config-snapshot-service.ts").RuntimeConfigSnapshotError
  >;
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
  } satisfies DownloadReconciliationServiceShape;
}

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

    return makeDownloadReconciliationService({
      db,
      eventBus,
      fs,
      mediaProbe,
      getRuntimeConfig: runtimeConfigSnapshotService.getRuntimeConfig,
      nowIso: () => nowIsoFromClock(clock),
      torrentClientService,
      randomUuid: () => random.randomUuid,
      tryDatabasePromise,
    });
  }),
);
