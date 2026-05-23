import { Effect } from "effect";

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
import { OperationsConfigRepository } from "@/features/operations/repository/config-repository.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";

export interface UnmappedScanServiceShape {
  readonly getUnmappedFolders: UnmappedScanQueryShape["getUnmappedFolders"];
  readonly matchAndPersistUnmappedFolder: UnmappedScanQueryShape["matchAndPersistUnmappedFolder"];
  readonly runUnmappedScan: UnmappedScanWorkflowShape["runUnmappedScan"];
}

const makeUnmappedScanService = Effect.fn("UnmappedScanService.make")(function* () {
  const { db } = yield* Database;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const configRepository = yield* OperationsConfigRepository;
  const systemUnmappedRepository = yield* SystemUnmappedRepository;
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const unmappedScanCoordinator = yield* UnmappedScanCoordinator;

  const scanWorkflow = makeUnmappedScanWorkflow({
    aniList,
    configRepository,
    db,
    eventBus,
    unmappedScanCoordinator,
    fs,
    nowIso: () => nowIsoFromClock(clock),
    systemUnmappedRepository,
    tryDatabasePromise,
  });

  return {
    getUnmappedFolders: scanWorkflow.getUnmappedFolders,
    matchAndPersistUnmappedFolder: scanWorkflow.matchAndPersistUnmappedFolder,
    runUnmappedScan: scanWorkflow.runUnmappedScan,
  } satisfies UnmappedScanServiceShape;
});

export class UnmappedScanService extends Effect.Service<UnmappedScanService>()(
  "@bakarr/api/UnmappedScanService",
  { effect: makeUnmappedScanService() },
) {}

export const UnmappedScanServiceLive = UnmappedScanService.Default;
