import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { makeUnmappedControlWorkflow } from "@/features/operations/unmapped-orchestration-control.ts";
import { makeUnmappedImportWorkflow } from "@/features/operations/unmapped-orchestration-import.ts";
import { makeUnmappedScanWorkflow } from "@/features/operations/unmapped-orchestration-scan.ts";
import { UnmappedScanCoordinator } from "@/features/operations/runtime-support.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type SearchUnmappedServiceShape = ReturnType<typeof makeUnmappedScanWorkflow> &
  ReturnType<typeof makeUnmappedControlWorkflow> &
  ReturnType<typeof makeUnmappedImportWorkflow>;

export class SearchUnmappedService extends Context.Tag("@bakarr/api/SearchUnmappedService")<
  SearchUnmappedService,
  SearchUnmappedServiceShape
>() {}

export const SearchUnmappedServiceLive = Layer.effect(
  SearchUnmappedService,
  Effect.gen(function* () {
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

    const controlWorkflow = makeUnmappedControlWorkflow({
      db,
      fs,
      matchAndPersistUnmappedFolder: scanWorkflow.matchAndPersistUnmappedFolder,
      nowIso: () => nowIsoFromClock(clock),
      tryDatabasePromise,
    });

    const importWorkflow = makeUnmappedImportWorkflow({
      db,
      fs,
      nowIso: () => nowIsoFromClock(clock),
      tryDatabasePromise,
    });

    return {
      ...scanWorkflow,
      ...controlWorkflow,
      ...importWorkflow,
    } satisfies SearchUnmappedServiceShape;
  }),
);
