import { Effect } from "effect";

import type { ScanResult } from "@packages/shared/index.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { FileSystem, isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { DomainInputError, DomainPathError, InfrastructureError } from "@/features/errors.ts";
import { scanImportPathEffect } from "@/features/operations/import-scan/import-path-scan-support.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";
import { getConfiguredLibraryPaths } from "@/features/media/shared/config-support.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { OperationsConfigRepository } from "@/features/operations/repository/config-repository.ts";

export interface ImportPathScanServiceShape {
  readonly scanImportPath: (input: {
    readonly mediaId?: number;
    readonly limit?: number;
    readonly path: string;
  }) => Effect.Effect<
    ScanResult,
    DatabaseError | DomainInputError | DomainPathError | InfrastructureError
  >;
}

export class ImportPathScanService extends Effect.Service<ImportPathScanService>()(
  "@bakarr/api/ImportPathScanService",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* Database;
      const aniList = yield* AniListClient;
      const fs = yield* FileSystem;
      const mediaProbe = yield* MediaProbe;
      const mediaReadRepository = yield* MediaReadRepository;
      const configRepository = yield* OperationsConfigRepository;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

      const scanImportPath = Effect.fn("ImportPathScanService.scanImportPath")(function* (input: {
        readonly mediaId?: number;
        readonly limit?: number;
        readonly path: string;
      }) {
        const config = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
          Effect.mapError((error: RuntimeConfigSnapshotError) =>
            error instanceof DatabaseError
              ? error
              : new InfrastructureError({
                  message: "Failed to load runtime config for import scan",
                  cause: error,
                }),
          ),
        );
        const canonicalPath = yield* fs.realPath(input.path).pipe(
          Effect.mapError(
            (cause) =>
              new DomainPathError({
                cause,
                message: `Import path is inaccessible: ${input.path}`,
              }),
          ),
        );

        const allowedPrefixes = [
          ...new Set(
            [
              ...getConfiguredLibraryPaths(config.library),
              config.library.recycle_path,
              config.downloads.root_path,
            ]
              .map((path) => path.trim())
              .filter((path) => path.length > 0),
          ),
        ];

        const isAllowed = allowedPrefixes.some((prefix) => isWithinPathRoot(canonicalPath, prefix));

        if (!isAllowed) {
          return yield* new DomainInputError({
            message: "Import path must be inside library, recycle, or downloads root",
          });
        }

        return yield* scanImportPathEffect({
          aniList,
          ...(input.mediaId === undefined ? {} : { mediaId: input.mediaId }),
          configRepository,
          db,
          fs,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          mediaReadRepository,
          mediaProbe,
          path: canonicalPath,
          tryDatabasePromise,
        }).pipe(
          Effect.mapError((error) =>
            error instanceof DatabaseError ||
            error instanceof DomainInputError ||
            error instanceof DomainPathError
              ? error
              : new InfrastructureError({
                  message: "Failed to scan import path",
                  cause: error,
                }),
          ),
        );
      });

      return { scanImportPath } satisfies ImportPathScanServiceShape;
    }),
  },
) {}

export const ImportPathScanServiceLive = ImportPathScanService.Default;
