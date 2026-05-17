import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import {
  makeUnmappedScanWorkflow,
  type UnmappedScanWorkflowShape,
} from "@/features/operations/unmapped/unmapped-orchestration-scan.ts";
import { type UnmappedScanQueryShape } from "@/features/operations/unmapped/unmapped-orchestration-scan-query.ts";
import { UnmappedScanCoordinator } from "@/features/operations/tasks/runtime-support.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export interface UnmappedScanServiceShape {
  readonly getUnmappedFolders: UnmappedScanQueryShape["getUnmappedFolders"];
  readonly matchAndPersistUnmappedFolder: UnmappedScanQueryShape["matchAndPersistUnmappedFolder"];
  readonly runUnmappedScan: UnmappedScanWorkflowShape["runUnmappedScan"];
}

export class UnmappedScanService extends Context.Tag("@bakarr/api/UnmappedScanService")<
  UnmappedScanService,
  UnmappedScanServiceShape
>() {}

const makeUnmappedScanService = Effect.gen(function* () {
  const { db } = yield* Database;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const unmappedScanCoordinator = yield* UnmappedScanCoordinator;

  const scanWorkflow = makeUnmappedScanWorkflow({
    aniList,
    db,
    eventBus,
    unmappedScanCoordinator,
    fs,
    nowIso: () => nowIsoFromClock(clock),
    tryDatabasePromise,
  });

  return UnmappedScanService.of({
    getUnmappedFolders: scanWorkflow.getUnmappedFolders,
    matchAndPersistUnmappedFolder: scanWorkflow.matchAndPersistUnmappedFolder,
    runUnmappedScan: scanWorkflow.runUnmappedScan,
  });
});

export const UnmappedScanServiceLive = Layer.effect(UnmappedScanService, makeUnmappedScanService);
