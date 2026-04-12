import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import {
  addMagnetToQueuedDownload,
  insertQueuedDownload,
  prepareTriggerDownload,
} from "@/features/operations/download-trigger-support.ts";
import { appendLog, recordDownloadEvent } from "@/features/operations/job-support.ts";
import {
  DownloadConflictError,
  OperationsAnimeNotFoundError,
  OperationsInfrastructureError,
  OperationsInputError,
  OperationsStoredDataError,
} from "@/features/operations/errors.ts";
import type { TriggerDownloadInput } from "@/features/operations/download-orchestration-shared.ts";
import type { DownloadTriggerCoordinatorShape } from "@/features/operations/runtime-support.ts";
import { Database, type AppDatabase } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise, type TryDatabasePromise } from "@/lib/effect-db.ts";
import { DownloadProgressSupport } from "@/features/operations/download-progress-support.ts";
import { DownloadTriggerCoordinator } from "@/features/operations/runtime-support.ts";

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
  readonly db: AppDatabase;
  readonly torrentClientService: typeof TorrentClientService.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly nowIso: () => Effect.Effect<string>;
  readonly downloadTriggerCoordinator: DownloadTriggerCoordinatorShape;
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
}) {
  const {
    db,
    torrentClientService,
    eventBus,
    tryDatabasePromise,
    downloadTriggerCoordinator,
    publishDownloadProgress,
  } = input;
  const { nowIso } = input;

  const executeTriggerDownload = Effect.fn("OperationsService.executeTriggerDownload")(function* (
    triggerInput: TriggerDownloadInput,
  ) {
    yield* Effect.annotateCurrentSpan("animeId", triggerInput.anime_id);
    const plan = yield* prepareTriggerDownload({
      db,
      nowIso,
      triggerInput,
    });

    yield* Effect.annotateCurrentSpan("isBatch", plan.effectiveIsBatch);
    yield* Effect.annotateCurrentSpan("hasMagnet", Boolean(triggerInput.magnet));
    yield* Effect.annotateCurrentSpan("episodeNumber", plan.requestedEpisode);

    const insertedId = yield* insertQueuedDownload({
      db,
      plan,
      triggerInput,
      tryDatabasePromise,
    });
    const status = yield* addMagnetToQueuedDownload({
      db,
      insertedId,
      magnet: triggerInput.magnet,
      torrentClientService,
      tryDatabasePromise,
    });
    const shouldDeferBatchCoverage =
      plan.effectiveIsBatch && plan.inferredCoveredEpisodes.length === 0;

    yield* recordDownloadEvent(
      db,
      {
        animeId: plan.animeRow.id,
        downloadId: insertedId,
        eventType: "download.queued",
        metadataJson: {
          covered_episodes: plan.inferredCoveredEpisodes,
          source_metadata: plan.sourceMetadata,
        },
        message: `Queued ${triggerInput.title}`,
        metadata: plan.coveredEpisodes,
        toStatus: status,
      },
      nowIso,
    );

    yield* appendLog(
      db,
      "downloads.triggered",
      "success",
      shouldDeferBatchCoverage
        ? `Queued batch download for ${plan.animeRow.titleRomaji}; waiting for qBittorrent metadata to determine covered episodes`
        : `Queued download for ${plan.animeRow.titleRomaji} episode ${plan.requestedEpisode}`,
      nowIso,
    );

    yield* eventBus.publish({
      type: "DownloadStarted",
      payload: {
        anime_id: plan.animeRow.id,
        source_metadata: plan.sourceMetadata,
        title: triggerInput.title,
      },
    });

    yield* publishDownloadProgress();
  });

  const triggerDownload = Effect.fn("OperationsService.triggerDownload")(function* (
    input: TriggerDownloadInput,
  ) {
    yield* Effect.annotateCurrentSpan("animeId", input.anime_id);

    return yield* downloadTriggerCoordinator.runExclusiveDownloadTrigger(
      executeTriggerDownload(input).pipe(Effect.withSpan("operations.downloads.trigger")),
    );
  });

  return {
    triggerDownload,
  } satisfies DownloadTriggerServiceShape;
}

export class DownloadTriggerService extends Context.Tag("@bakarr/api/DownloadTriggerService")<
  DownloadTriggerService,
  DownloadTriggerServiceShape
>() {}

export const DownloadTriggerServiceLive = Layer.effect(
  DownloadTriggerService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const torrentClientService = yield* TorrentClientService;
    const clock = yield* ClockService;
    const progressSupport = yield* DownloadProgressSupport;
    const downloadTriggerCoordinator = yield* DownloadTriggerCoordinator;

    return makeDownloadTriggerService({
      db,
      downloadTriggerCoordinator,
      eventBus,
      nowIso: () => nowIsoFromClock(clock),
      publishDownloadProgress: progressSupport.publishDownloadProgress,
      torrentClientService,
      tryDatabasePromise,
    });
  }),
);
