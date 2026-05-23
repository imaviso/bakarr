import { Effect } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { DownloadReconciliationRepository } from "@/features/operations/repository/download-reconciliation-repository.ts";
import { makeDownloadCompletedTorrentReconciliation } from "@/features/operations/download/download-reconciliation-completed-torrent.ts";
import { makeReconcileDownloadByIdEffect } from "@/features/operations/download/download-reconciliation-lookup.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import type { DomainConflictError, DomainNotFoundError } from "@/features/errors.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import type { MaybeCleanupImportedTorrent } from "@/features/operations/download/download-reconciliation-shared.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";

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
    | DomainConflictError
    | DomainNotFoundError
    | ExternalCallError
    | OperationsError
    | DatabaseError
    | RuntimeConfigSnapshotError
  >;
}

export class DownloadReconciliationService extends Effect.Service<DownloadReconciliationService>()(
  "@bakarr/api/DownloadReconciliationService",
  {
    effect: Effect.gen(function* () {
      const repo = yield* DownloadReconciliationRepository;
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaProbe = yield* MediaProbe;
      const mediaReadRepository = yield* MediaReadRepository;
      const torrentClientService = yield* TorrentClientService;
      const clock = yield* ClockService;
      const random = yield* RandomService;
      const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;
      const nowIso = () => nowIsoFromClock(clock);
      const randomUuid = () => random.randomUuid;

      const { reconcileCompletedTorrentEffect, maybeCleanupImportedTorrent } =
        makeDownloadCompletedTorrentReconciliation(
          repo,
          fs,
          mediaProbe,
          mediaReadRepository,
          torrentClientService,
          eventBus,
          nowIso,
          randomUuid,
          runtimeConfigSnapshotService.getRuntimeConfig,
        );
      const reconcileDownloadByIdEffect = makeReconcileDownloadByIdEffect({
        repo,
        reconcileCompletedTorrentEffect,
      });

      return {
        maybeCleanupImportedTorrent,
        reconcileCompletedTorrentEffect,
        reconcileDownloadByIdEffect,
      } satisfies DownloadReconciliationServiceShape;
    }),
  },
) {}

export const DownloadReconciliationServiceLive = DownloadReconciliationService.Default;
