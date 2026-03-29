import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { type FileSystemShape } from "@/lib/filesystem.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { AnimeImportService } from "@/features/anime/import-service.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import { makeUnmappedControlWorkflow } from "@/features/operations/unmapped-orchestration-control.ts";
import { makeUnmappedImportWorkflow } from "@/features/operations/unmapped-orchestration-import.ts";
import { makeUnmappedScanWorkflow } from "@/features/operations/unmapped-orchestration-scan.ts";
import type { OperationsCoordinationShape } from "@/features/operations/runtime-support.ts";

export { cleanupPreviousAnimeRootFolderAfterImport } from "@/features/operations/unmapped-orchestration-import.ts";

export function makeUnmappedOrchestrationSupport(input: {
  aniList: typeof AniListClient.Service;
  animeImportService: typeof AnimeImportService.Service;
  db: AppDatabase;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  coordination: OperationsCoordinationShape;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { aniList, animeImportService, db, coordination, fs, tryDatabasePromise } = input;
  const { nowIso } = input;

  const scanWorkflow = makeUnmappedScanWorkflow({
    aniList,
    db,
    coordination,
    fs,
    nowIso,
    tryDatabasePromise,
  });

  const controlWorkflow = makeUnmappedControlWorkflow({
    db,
    fs,
    matchAndPersistUnmappedFolder: scanWorkflow.matchAndPersistUnmappedFolder,
    nowIso,
    tryDatabasePromise,
  });

  const importWorkflow = makeUnmappedImportWorkflow({
    animeImportService,
    db,
    fs,
    nowIso,
    tryDatabasePromise,
  });

  return {
    ...scanWorkflow,
    ...controlWorkflow,
    ...importWorkflow,
  };
}
