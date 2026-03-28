import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "../../db/database.ts";
import { ClockService, nowIsoFromClock } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import { RandomService } from "../../lib/random.ts";
import { EventBus } from "../events/event-bus.ts";
import { tryDatabasePromise, toDatabaseError } from "../../lib/effect-db.ts";
import { makeDownloadOrchestration } from "./download-orchestration.ts";
import { OperationsSharedState } from "./operations-shared-state.ts";
import type { TriggerDownloadInput } from "./download-orchestration-shared.ts";
import type { OperationsError } from "./errors.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { maybeQBitConfig, wrapOperationsError } from "./service-support.ts";

export interface DownloadTriggerServiceShape {
  readonly triggerDownload: (
    input: TriggerDownloadInput,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
}

export class DownloadTriggerService extends Context.Tag("@bakarr/api/DownloadTriggerService")<
  DownloadTriggerService,
  DownloadTriggerServiceShape
>() {}

const makeDownloadOrchestrationEffect = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const qbitClient = yield* QBitTorrentClient;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const clock = yield* ClockService;
  const random = yield* RandomService;
  const sharedState = yield* OperationsSharedState;

  return makeDownloadOrchestration({
    db,
    dbError: toDatabaseError,
    eventBus,
    fs,
    mediaProbe,
    maybeQBitConfig,
    currentMonotonicMillis: () => clock.currentMonotonicMillis,
    currentTimeMillis: () => clock.currentTimeMillis,
    nowIso: () => nowIsoFromClock(clock),
    qbitClient,
    randomUuid: () => random.randomUuid,
    tryDatabasePromise,
    wrapOperationsError,
    coordination: sharedState,
  });
});

export const DownloadTriggerServiceLive = Layer.effect(
  DownloadTriggerService,
  Effect.map(
    makeDownloadOrchestrationEffect,
    (download) =>
      ({
        triggerDownload: download.triggerDownload,
      }) satisfies DownloadTriggerServiceShape,
  ),
);

export interface DownloadControlServiceShape {
  readonly applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly reconcileDownloadByIdEffect: (
    id: number,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly retryDownloadById: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly syncDownloadState: (trigger: string) => Effect.Effect<void, DatabaseError>;
}

export class DownloadControlService extends Context.Tag("@bakarr/api/DownloadControlService")<
  DownloadControlService,
  DownloadControlServiceShape
>() {}

export const DownloadControlServiceLive = Layer.effect(
  DownloadControlService,
  Effect.map(
    makeDownloadOrchestrationEffect,
    (download) =>
      ({
        applyDownloadActionEffect: download.applyDownloadActionEffect,
        reconcileDownloadByIdEffect: download.reconcileDownloadByIdEffect,
        retryDownloadById: download.retryDownloadById,
        syncDownloadState: download.syncDownloadState,
      }) satisfies DownloadControlServiceShape,
  ),
);

export interface DownloadProgressServiceShape {
  readonly publishDownloadProgress: () => Effect.Effect<void, DatabaseError>;
}

export class DownloadProgressService extends Context.Tag("@bakarr/api/DownloadProgressService")<
  DownloadProgressService,
  DownloadProgressServiceShape
>() {}

export const DownloadProgressServiceLive = Layer.effect(
  DownloadProgressService,
  Effect.map(
    makeDownloadOrchestrationEffect,
    (download) =>
      ({
        publishDownloadProgress: download.publishDownloadProgress,
      }) satisfies DownloadProgressServiceShape,
  ),
);
