import { Context, Effect, Layer } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { FileSystem, type FileSystemShape } from "@/lib/filesystem.ts";
import { MediaProbe, type MediaProbeShape } from "@/lib/media-probe.ts";
import { tryDatabasePromise, type TryDatabasePromise } from "@/lib/effect-db.ts";
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

export type SearchImportPathServiceShape = ReturnType<typeof makeSearchImportPathSupport>;

export class SearchImportPathService extends Context.Tag("@bakarr/api/SearchImportPathService")<
  SearchImportPathService,
  SearchImportPathServiceShape
>() {}

export const SearchImportPathServiceLive = Layer.effect(
  SearchImportPathService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const aniList = yield* AniListClient;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;

    return makeSearchImportPathSupport({
      aniList,
      db,
      fs,
      mediaProbe,
      tryDatabasePromise,
    });
  }),
);
