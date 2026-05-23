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
import {
  DownloadConflictError,
  OperationsAnimeNotFoundError,
  OperationsInfrastructureError,
  OperationsInputError,
  OperationsStoredDataError,
} from "@/features/operations/errors.ts";
import type { TriggerDownloadInput } from "@/features/operations/download/download-orchestration-shared.ts";
import type { DownloadTriggerCoordinatorShape } from "@/features/operations/tasks/runtime-support.ts";
import { DownloadTriggerRepository } from "@/features/operations/repository/download-trigger-repository.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { DownloadProgressSupport } from "@/features/operations/download/download-progress-support.ts";
import { DownloadTriggerCoordinator } from "@/features/operations/tasks/runtime-support.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";

export interface DownloadTriggerServiceShape {
  readonly triggerDownload: (
    input: TriggerDownloadInput,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | DownloadConflictError
    | OperationsAnimeNotFoundError
    | OperationsInputError
    | OperationsStoredDataError
    | OperationsInfrastructureError
  >;
}

export function makeDownloadTriggerService(input: {
  readonly triggerRepo: typeof DownloadTriggerRepository.Service;
  readonly torrentClientService: typeof TorrentClientService.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly mediaReadRepository: typeof MediaReadRepository.Service;
  readonly nowIso: () => Effect.Effect<string>;
  readonly downloadTriggerCoordinator: DownloadTriggerCoordinatorShape;
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
}) {
  const {
    triggerRepo,
    torrentClientService,
    eventBus,
    mediaReadRepository,
    downloadTriggerCoordinator,
    publishDownloadProgress,
    nowIso,
  } = input;

  const executeTriggerDownload = Effect.fn("OperationsService.executeTriggerDownload")(function* (
    triggerInput: TriggerDownloadInput,
  ) {
    yield* Effect.annotateCurrentSpan("mediaId", triggerInput.media_id);
    const plan = yield* prepareTriggerDownload({
      triggerRepo,
      mediaReadRepository,
      nowIso,
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

    const eventNow = yield* nowIso();
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

    const logNow = yield* nowIso();
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

    yield* publishDownloadProgress();
  });

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
}

export class DownloadTriggerService extends Effect.Service<DownloadTriggerService>()(
  "@bakarr/api/DownloadTriggerService",
  {
    effect: Effect.gen(function* () {
      const triggerRepo = yield* DownloadTriggerRepository;
      const eventBus = yield* EventBus;
      const torrentClientService = yield* TorrentClientService;
      const clock = yield* ClockService;
      const progressSupport = yield* DownloadProgressSupport;
      const downloadTriggerCoordinator = yield* DownloadTriggerCoordinator;
      const mediaReadRepository = yield* MediaReadRepository;

      return makeDownloadTriggerService({
        triggerRepo,
        downloadTriggerCoordinator,
        eventBus,
        mediaReadRepository,
        nowIso: () => nowIsoFromClock(clock),
        publishDownloadProgress: progressSupport.publishDownloadProgress,
        torrentClientService,
      });
    }),
  },
) {}

export const DownloadTriggerServiceLive = DownloadTriggerService.Default;
