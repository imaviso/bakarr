import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import {
  makeUnmappedImportWorkflow,
  type UnmappedImportWorkflowShape,
} from "@/features/operations/unmapped-orchestration-import.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type UnmappedImportServiceShape = UnmappedImportWorkflowShape;

export class UnmappedImportService extends Context.Tag("@bakarr/api/UnmappedImportService")<
  UnmappedImportService,
  UnmappedImportServiceShape
>() {}

const makeUnmappedImportService = Effect.gen(function* () {
  const { db } = yield* Database;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;

  return makeUnmappedImportWorkflow({
    db,
    fs,
    nowIso: () => nowIsoFromClock(clock),
    tryDatabasePromise,
  });
});

export const UnmappedImportServiceLive = Layer.effect(
  UnmappedImportService,
  makeUnmappedImportService,
);
