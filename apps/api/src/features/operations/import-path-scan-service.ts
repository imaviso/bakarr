import { Context, Effect, Layer } from "effect";

import type { ScanResult } from "@packages/shared/index.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { FileSystem, isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  OperationsInfrastructureError,
  OperationsInputError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import { scanImportPathEffect } from "@/features/operations/import-path-scan-support.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";

export interface ImportPathScanServiceShape {
  readonly scanImportPath: (input: {
    readonly animeId?: number;
    readonly limit?: number;
    readonly path: string;
  }) => Effect.Effect<
    ScanResult,
    DatabaseError | OperationsInputError | OperationsPathError | OperationsInfrastructureError
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
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    const scanImportPath = Effect.fn("ImportPathScanService.scanImportPath")(function* (input: {
      readonly animeId?: number;
      readonly limit?: number;
      readonly path: string;
    }) {
      const config = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
        Effect.mapError((error: RuntimeConfigSnapshotError) =>
          error instanceof DatabaseError
            ? error
            : new OperationsInfrastructureError({
                message: "Failed to load runtime config for import scan",
                cause: error,
              }),
        ),
      );
      const canonicalPath = yield* fs.realPath(input.path).pipe(
        Effect.mapError(
          (cause) =>
            new OperationsPathError({
              cause,
              message: `Import path is inaccessible: ${input.path}`,
            }),
        ),
      );

      const allowedPrefixes = [
        ...new Set(
          [config.library.library_path, config.library.recycle_path, config.downloads.root_path]
            .map((path) => path.trim())
            .filter((path) => path.length > 0),
        ),
      ];

      const isAllowed = allowedPrefixes.some((prefix) => isWithinPathRoot(canonicalPath, prefix));

      if (!isAllowed) {
        return yield* new OperationsInputError({
          message: "Import path must be inside library, recycle, or downloads root",
        });
      }

      return yield* scanImportPathEffect({
        aniList,
        ...(input.animeId === undefined ? {} : { animeId: input.animeId }),
        db,
        fs,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        mediaProbe,
        path: canonicalPath,
        tryDatabasePromise,
      }).pipe(
        Effect.mapError((error) =>
          error instanceof DatabaseError ||
          error instanceof OperationsInputError ||
          error instanceof OperationsPathError
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
