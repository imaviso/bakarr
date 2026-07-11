import { Effect } from "effect";

import { EventBus } from "@/features/events/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import { DownloadProgressSupport } from "@/features/operations/download/download-progress-support.ts";
import { makeDownloadCompletedTorrentReconciliation } from "@/features/operations/download/download-reconciliation.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type {
  ReconcileByIdError,
  ReconcileCompletedError,
} from "@/features/operations/download/download-reconciliation.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";

export interface DownloadReconciliationServiceShape {
  readonly maybeCleanupImportedTorrent: (
    config: import("@packages/shared/index.ts").Config | null | undefined,
    infoHash: string | null,
  ) => Effect.Effect<void>;
  readonly reconcileCompletedTorrentEffect: (
    infoHash: string,
    contentPath: string | undefined,
  ) => Effect.Effect<void, ReconcileCompletedError>;
  readonly reconcileDownloadByIdEffect: (id: number) => Effect.Effect<void, ReconcileByIdError>;
}

export class DownloadReconciliationService extends Effect.Service<DownloadReconciliationService>()(
  "@bakarr/api/DownloadReconciliationService",
  {
    dependencies: [
      DownloadRepository.Default,
      EventBus.Default,
      MediaReadRepository.Default,
      MediaUnitRepository.Default,
      RandomService.Default,
    ],
    effect: Effect.gen(function* () {
      const repo = yield* DownloadRepository;
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaProbe = yield* MediaProbe;
      const mediaReadRepository = yield* MediaReadRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const torrentClientService = yield* TorrentClientService;
      const progressSupport = yield* DownloadProgressSupport;
      const random = yield* RandomService;
      const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;

      const core = makeDownloadCompletedTorrentReconciliation(
        repo,
        mediaUnitRepository,
        fs,
        mediaProbe,
        mediaReadRepository,
        torrentClientService,
        eventBus,
        currentNowIso,
        () => random.randomUuid,
        runtimeConfigSnapshotService.getRuntimeConfig,
      );

      const reconcileDownloadByIdEffect = Effect.fn("OperationsService.reconcileDownloadById")(
        function* (id: number) {
          yield* core.reconcileDownloadByIdEffect(id);
          yield* progressSupport.publishDownloadProgress();
          yield* eventBus.publishInfo(`Reconciled download ${id}`);
        },
      );

      return {
        maybeCleanupImportedTorrent: core.maybeCleanupImportedTorrent,
        reconcileCompletedTorrentEffect: core.reconcileCompletedTorrentEffect,
        reconcileDownloadByIdEffect,
      } satisfies DownloadReconciliationServiceShape;
    }),
  },
) {}

export const DownloadReconciliationServiceLive = DownloadReconciliationService.Default;
