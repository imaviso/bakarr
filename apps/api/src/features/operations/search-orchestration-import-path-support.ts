import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { MediaProbeShape } from "@/lib/media-probe.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import {
  OperationsPathError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import { scanImportPathEffect } from "@/features/operations/import-path-scan-support.ts";

export interface SearchImportPathSupportInput {
  readonly aniList: typeof AniListClient.Service;
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly tryDatabasePromise: TryDatabasePromise;
}

export function makeSearchImportPathSupport(input: SearchImportPathSupportInput) {
  const { aniList, db, fs, mediaProbe, tryDatabasePromise } = input;

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
          : new OperationsInfrastructureError({
              message: "Failed to scan import path",
              cause: error,
            }),
      ),
    );
  });

  return {
    scanImportPath,
  };
}
