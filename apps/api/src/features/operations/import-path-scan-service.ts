import { Context, Effect, Layer } from "effect";

import type { ScanResult } from "@packages/shared/index.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import {
  OperationsInfrastructureError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import { scanImportPathEffect } from "@/features/operations/import-path-scan-support.ts";

export interface ImportPathScanServiceShape {
  readonly scanImportPath: (input: {
    readonly animeId?: number;
    readonly limit?: number;
    readonly path: string;
  }) => Effect.Effect<
    ScanResult,
    DatabaseError | OperationsPathError | OperationsInfrastructureError
  >;
}

export class ImportPathScanService extends Context.Tag("@bakarr/api/ImportPathScanService")<
  ImportPathScanService,
  ImportPathScanServiceShape
>() {}

export const ImportPathScanServiceLive = Layer.effect(
  ImportPathScanService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const aniList = yield* AniListClient;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;

    const scanImportPath = Effect.fn("ImportPathScanService.scanImportPath")(function* (input: {
      readonly animeId?: number;
      readonly limit?: number;
      readonly path: string;
    }) {
      return yield* scanImportPathEffect({
        aniList,
        ...(input.animeId === undefined ? {} : { animeId: input.animeId }),
        db,
        fs,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        mediaProbe,
        path: input.path,
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

    return ImportPathScanService.of({ scanImportPath });
  }),
);
