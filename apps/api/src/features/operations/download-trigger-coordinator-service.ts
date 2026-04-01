import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { maybeQBitConfig } from "@/features/operations/operations-qbit-config.ts";
import { DownloadProgressSupport } from "@/features/operations/download-progress-support.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { DownloadTriggerCoordinator } from "@/features/operations/runtime-support.ts";
import { makeDownloadTriggerService } from "@/features/operations/download-trigger-service.ts";

export type DownloadTriggerServiceShape = ReturnType<typeof makeDownloadTriggerService>;

export class DownloadTriggerService extends Context.Tag("@bakarr/api/DownloadTriggerService")<
  DownloadTriggerService,
  DownloadTriggerServiceShape
>() {}

export const DownloadTriggerServiceLive = Layer.effect(
  DownloadTriggerService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const qbitClient = yield* QBitTorrentClient;
    const clock = yield* ClockService;
    const progressSupport = yield* DownloadProgressSupport;
    const downloadTriggerCoordinator = yield* DownloadTriggerCoordinator;

    return makeDownloadTriggerService({
      db,
      downloadTriggerCoordinator,
      eventBus,
      maybeQBitConfig,
      nowIso: () => nowIsoFromClock(clock),
      publishDownloadProgress: progressSupport.publishDownloadProgress,
      qbitClient,
      tryDatabasePromise,
    });
  }),
);
