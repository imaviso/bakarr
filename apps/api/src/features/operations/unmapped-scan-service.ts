import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import {
  makeUnmappedScanWorkflow,
  type UnmappedScanWorkflowShape,
} from "@/features/operations/unmapped-orchestration-scan.ts";
import {
  makeUnmappedScanQuerySupport,
  type UnmappedScanQueryShape,
} from "@/features/operations/unmapped-orchestration-scan-query.ts";
import { UnmappedScanCoordinator } from "@/features/operations/runtime-support.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export interface UnmappedScanServiceShape {
  readonly getUnmappedFolders: UnmappedScanQueryShape["getUnmappedFolders"];
  readonly runUnmappedScan: UnmappedScanWorkflowShape["runUnmappedScan"];
}

export interface UnmappedScanMatchServiceShape {
  readonly matchAndPersistUnmappedFolder: UnmappedScanQueryShape["matchAndPersistUnmappedFolder"];
}

export class UnmappedScanService extends Context.Tag("@bakarr/api/UnmappedScanService")<
  UnmappedScanService,
  UnmappedScanServiceShape
>() {}

export class UnmappedScanMatchService extends Context.Tag("@bakarr/api/UnmappedScanMatchService")<
  UnmappedScanMatchService,
  UnmappedScanMatchServiceShape
>() {}

const makeUnmappedScanService = Effect.gen(function* () {
  const { db } = yield* Database;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
  const unmappedScanCoordinator = yield* UnmappedScanCoordinator;

  const scanWorkflow = makeUnmappedScanWorkflow({
    aniList,
    db,
    unmappedScanCoordinator,
    fs,
    nowIso: () => nowIsoFromClock(clock),
    tryDatabasePromise,
  });

  return UnmappedScanService.of({
    getUnmappedFolders: scanWorkflow.getUnmappedFolders,
    runUnmappedScan: scanWorkflow.runUnmappedScan,
  });
});

const makeUnmappedScanMatchService = Effect.gen(function* () {
  const { db } = yield* Database;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;

  const querySupport = makeUnmappedScanQuerySupport({
    aniList,
    db,
    fs,
    nowIso: () => nowIsoFromClock(clock),
    tryDatabasePromise,
  });

  return UnmappedScanMatchService.of({
    matchAndPersistUnmappedFolder: querySupport.matchAndPersistUnmappedFolder,
  });
});

export const UnmappedScanServiceLive = Layer.effect(UnmappedScanService, makeUnmappedScanService);

export const UnmappedScanMatchServiceLive = Layer.effect(
  UnmappedScanMatchService,
  makeUnmappedScanMatchService,
);
