import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import type { AniListClient } from "../anime/anilist.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";
import { OperationsPathError } from "./errors.ts";
import { scanImportPathEffect } from "./import-path-scan-support.ts";

export interface SearchImportPathSupportInput {
  readonly aniList: typeof AniListClient.Service;
  readonly db: AppDatabase;
  readonly dbError: (message: string) => (cause: unknown) => DatabaseError;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly tryDatabasePromise: TryDatabasePromise;
}

export function makeSearchImportPathSupport(input: SearchImportPathSupportInput) {
  const { aniList, db, dbError, fs, mediaProbe, tryDatabasePromise } = input;

  const scanImportPath = Effect.fn("OperationsService.scanImportPath")(function* (
    path: string,
    animeId?: number,
  ) {
    return yield* scanImportPathEffect({
      aniList,
      animeId,
      db,
      fs,
      mediaProbe,
      path,
      tryDatabasePromise,
    }).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError || error instanceof OperationsPathError
          ? error
          : dbError("Failed to scan import path")(error),
      ),
    );
  });

  return {
    scanImportPath,
  };
}
