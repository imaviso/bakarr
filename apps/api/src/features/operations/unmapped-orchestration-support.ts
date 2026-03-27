import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { type FileSystemShape } from "../../lib/filesystem.ts";
import { AniListClient } from "../anime/anilist.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";
import { makeUnmappedControlWorkflow } from "./unmapped-orchestration-control.ts";
import { makeUnmappedImportWorkflow } from "./unmapped-orchestration-import.ts";
import { makeUnmappedScanWorkflow } from "./unmapped-orchestration-scan.ts";
import type { OperationsCoordinationShape } from "./runtime-support.ts";

export { cleanupPreviousAnimeRootFolderAfterImport } from "./unmapped-orchestration-import.ts";

export function makeUnmappedOrchestrationSupport(input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  coordination: OperationsCoordinationShape;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { aniList, db, dbError, coordination, fs, tryDatabasePromise } = input;
  const { nowIso } = input;

  const scanWorkflow = makeUnmappedScanWorkflow({
    aniList,
    db,
    dbError,
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
