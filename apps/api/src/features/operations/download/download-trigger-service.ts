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
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { DownloadProgressSupport } from "@/features/operations/download/download-progress-support.ts";
import { DownloadTriggerCoordinator } from "@/features/operations/tasks/runtime-support.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";

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
    dependencies: [
      DownloadRepository.Default,
      EventBus.Default,
      DownloadTriggerCoordinator.Default,
      MediaReadRepository.Default,
    ],
    effect: Effect.gen(function* () {
      const triggerRepo = yield* DownloadRepository;
      const eventBus = yield* EventBus;
      const torrentClientService = yield* TorrentClientService;
      const progressSupport = yield* DownloadProgressSupport;
      const downloadTriggerCoordinator = yield* DownloadTriggerCoordinator;
      const mediaReadRepository = yield* MediaReadRepository;

      const executeTriggerDownload = Effect.fn("OperationsService.executeTriggerDownload")(
        function* (triggerInput: TriggerDownloadInput) {
          yield* Effect.annotateCurrentSpan("mediaId", triggerInput.media_id);
          const plan = yield* prepareTriggerDownload({
            triggerRepo,
            mediaReadRepository,
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

          const logNow = yield* currentNowIso();
          yield* triggerRepo.appendLogRow({
            eventType: "downloads.triggered",
            level: "success",
            message: shouldDeferBatchCoverage
              ? `Queued batch download for ${plan.animeRow.titleRomaji}; waiting for qBittorrent metadata to determine covered mediaUnits`
              : `Queued download for ${plan.animeRow.titleRomaji} episode ${plan.requestedEpisode}`,
            createdAt: logNow,
          });

          yield* eventBus.publish({
            type: "DownloadStarted",
            payload: {
              media_id: brandMediaId(plan.animeRow.id),
              source_metadata: plan.sourceMetadata,
              title: triggerInput.title,
            },
          });

          yield* progressSupport.publishDownloadProgress();
        },
      );

      const triggerDownload = Effect.fn("OperationsService.triggerDownload")(function* (
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
