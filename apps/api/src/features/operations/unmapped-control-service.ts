import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import {
  makeUnmappedControlWorkflow,
  type UnmappedControlWorkflowShape,
} from "@/features/operations/unmapped-orchestration-control.ts";
import { UnmappedScanMatchService } from "@/features/operations/unmapped-scan-service.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type UnmappedControlServiceShape = UnmappedControlWorkflowShape;

export class UnmappedControlService extends Context.Tag("@bakarr/api/UnmappedControlService")<
  UnmappedControlService,
  UnmappedControlServiceShape
>() {}

const makeUnmappedControlService = Effect.gen(function* () {
  const { db } = yield* Database;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
  const scanMatchService = yield* UnmappedScanMatchService;

  return makeUnmappedControlWorkflow({
    db,
    fs,
    matchAndPersistUnmappedFolder: scanMatchService.matchAndPersistUnmappedFolder,
    nowIso: () => nowIsoFromClock(clock),
    tryDatabasePromise,
  });
});

export const UnmappedControlServiceLive = Layer.effect(
  UnmappedControlService,
  makeUnmappedControlService,
);
