import { Effect } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import {
  addMagnetToQueuedDownload,
  insertQueuedDownload,
  prepareTriggerDownload,
} from "@/features/operations/download/download-trigger-support.ts";
import { DomainInputError, InfrastructureError, StoredDataError } from "@/features/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import type { OperationsConflictError } from "@/features/operations/errors.ts";
import type { TriggerDownloadInput } from "@/features/operations/download/download-orchestration-shared.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { DownloadProgressService } from "@/features/operations/download/download-progress-service.ts";
import { DownloadTriggerCoordinator } from "@/features/operations/tasks/task-coordinators.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";

export interface DownloadTriggerServiceShape {
  readonly triggerDownload: (
    input: TriggerDownloadInput,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | OperationsConflictError
    | MediaNotFoundError
    | DomainInputError
    | StoredDataError
    | InfrastructureError
  >;
}

export class DownloadTriggerService extends Effect.Service<DownloadTriggerService>()(
  "@bakarr/api/DownloadTriggerService",
  {
    // Progress + torrent client provided by ops feature layer.
    dependencies: [
      DownloadRepository.Default,
      DownloadTriggerCoordinator.Default,
      EventBus.Default,
      MediaRepository.Default,
      SystemLogRepository.Default,
    ],
    effect: Effect.gen(function* () {
      const triggerRepo = yield* DownloadRepository;
      const eventBus = yield* EventBus;
      const torrentClientService = yield* TorrentClientService;
      const progressSupport = yield* DownloadProgressService;
      const downloadTriggerCoordinator = yield* DownloadTriggerCoordinator;
      const systemLogRepository = yield* SystemLogRepository;
      const mediaRepository = yield* MediaRepository;

      const executeTriggerDownload = Effect.fn("DownloadTrigger.executeTriggerDownload")(function* (
        triggerInput: TriggerDownloadInput,
      ) {
        yield* Effect.annotateCurrentSpan("mediaId", triggerInput.media_id);
        const plan = yield* prepareTriggerDownload({
          triggerRepo,
          mediaRepository,
          nowIso: currentNowIso,
          triggerInput,
        });

        yield* Effect.annotateCurrentSpan("isBatch", plan.effectiveIsBatch);
        yield* Effect.annotateCurrentSpan("hasMagnet", Boolean(triggerInput.magnet));
        yield* Effect.annotateCurrentSpan("unitNumber", plan.requestedEpisode);

        const insertedId = yield* insertQueuedDownload({
          triggerRepo,
          plan,
          triggerInput,
        });
        const status = yield* addMagnetToQueuedDownload({
          triggerRepo,
          insertedId,
          magnet: triggerInput.magnet,
          torrentClientService,
        });
        const shouldDeferBatchCoverage =
          plan.effectiveIsBatch && plan.inferredCoveredEpisodes.length === 0;

        const eventNow = yield* currentNowIso();
        yield* triggerRepo.insertDownloadEvent(
          {
            mediaId: plan.animeRow.id,
            downloadId: insertedId,
            eventType: "download.queued",
            metadataJson: {
              covered_units: plan.inferredCoveredEpisodes,
              source_metadata: plan.sourceMetadata,
            },
            message: `Queued ${triggerInput.title}`,
            metadata: plan.coveredUnits,
            toStatus: status,
          },
          eventNow,
        );

        yield* systemLogRepository.appendLog(
          "downloads.triggered",
          "success",
          shouldDeferBatchCoverage
            ? `Queued batch download for ${plan.animeRow.titleRomaji}; waiting for qBittorrent metadata to determine covered mediaUnits`
            : `Queued download for ${plan.animeRow.titleRomaji} episode ${plan.requestedEpisode}`,
          currentNowIso,
        );

        yield* eventBus.publish({
          type: "DownloadStarted",
          payload: {
            media_id: brandMediaId(plan.animeRow.id),
            source_metadata: plan.sourceMetadata,
            title: triggerInput.title,
          },
        });

        yield* progressSupport.publishDownloadProgress();
      });

      const triggerDownload = Effect.fn("DownloadTrigger.triggerDownload")(function* (
        input: TriggerDownloadInput,
      ) {
        yield* Effect.annotateCurrentSpan("mediaId", input.media_id);

        return yield* downloadTriggerCoordinator.runExclusiveDownloadTrigger(
          executeTriggerDownload(input).pipe(Effect.withSpan("operations.downloads.trigger")),
        );
      });

      return {
        triggerDownload,
      } satisfies DownloadTriggerServiceShape;
    }),
  },
) {}

export const DownloadTriggerServiceLive = DownloadTriggerService.Default;
