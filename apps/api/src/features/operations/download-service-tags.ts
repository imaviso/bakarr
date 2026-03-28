import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService, nowIsoFromClock } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import { RandomService } from "../../lib/random.ts";
import { EventBus } from "../events/event-bus.ts";
import { tryDatabasePromise, toDatabaseError } from "../../lib/effect-db.ts";
import { makeDownloadOrchestration } from "./download-orchestration.ts";
import { OperationsSharedState } from "./operations-shared-state.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import { maybeQBitConfig, wrapOperationsError } from "./service-support.ts";

export type DownloadWorkflowShape = ReturnType<typeof makeDownloadOrchestration>;

export class DownloadWorkflow extends Context.Tag("@bakarr/api/DownloadWorkflow")<
  DownloadWorkflow,
  DownloadWorkflowShape
>() {}

const makeDownloadWorkflow = Effect.gen(function* () {
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

export const DownloadWorkflowLive = Layer.effect(DownloadWorkflow, makeDownloadWorkflow);
