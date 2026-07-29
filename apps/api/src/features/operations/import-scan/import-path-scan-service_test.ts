import { Cause, Effect, Exit, Layer } from "effect";

import { assert, describe, it } from "@effect/vitest";
import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { ImportPathScanService } from "@/features/operations/import-scan/import-path-scan-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { makeRuntimeConfigSnapshotStub } from "@/test/stubs.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";

describe("ImportPathScanService", () => {
  it.effect("rejects paths outside library, recycle, and downloads roots", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const fs = makeScanFileSystem({
            realPath: () => Effect.succeed("/outside/imports"),
          });

          const exit = yield* Effect.exit(
            scanImportPathEffect(fs, db, {
              path: "/outside/imports",
            }),
          );

          assert.deepStrictEqual(exit._tag, "Failure");

          if (Exit.isFailure(exit)) {
            const failure = Cause.findErrorOption(exit.cause);
            assert.deepStrictEqual(failure._tag, "Some");

            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value._tag, "DomainInputError");
              assert.deepStrictEqual(
                failure.value.message,
                "Import path must be inside library, recycle, or downloads root",
              );
            }
          }
        }),
    }),
  );
});

function scanImportPathEffect(
  fs: FileSystemShape,
  database: AppDatabase,
  input: {
    readonly mediaId?: number;
    readonly limit?: number;
    readonly path: string;
  },
) {
  return Effect.flatMap(ImportPathScanService, (service) => service.scanImportPath(input)).pipe(
    Effect.provide(
      ImportPathScanService.layerWithoutDependencies.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(AppDrizzleDatabase, database),
            Layer.succeed(AniListClient, {
              getAnimeMetadataById: () => Effect.die(new Error("not used in test")),
              searchAnimeMetadata: () => Effect.die(new Error("not used in test")),
              getSeasonalAnime: () => Effect.die(new Error("not used in test")),
            }),
            Layer.succeed(FileSystem, fs),
            Layer.succeed(MediaProbe, {
              probeVideoFile: () => Effect.die(new Error("not used in test")),
            }),
            Layer.succeed(MediaRepository, {
              countMedia: () => Effect.die(new Error("not used in test")),
              findExistingMediaIds: () => Effect.die(new Error("not used in test")),
              findMediaRootFolderOwner: () => Effect.die(new Error("not used in test")),
              getMediaRow: () => Effect.die(new Error("not used in test")),
              getUnitRow: () => Effect.die(new Error("not used in test")),
              listCalendarEvents: () => Effect.die(new Error("not used in test")),
              listMappedUnitRows: () => Effect.die(new Error("not used in test")),
              listMediaRows: () => Effect.die(new Error("not used in test")),
              listMissingUnitNumbers: () => Effect.die(new Error("not used in test")),
              listUnitProgressStats: () => Effect.die(new Error("not used in test")),
              listUnitRowsByMediaId: () => Effect.die(new Error("not used in test")),
              listUnitRowsWithMediaKind: () => Effect.die(new Error("not used in test")),
              listWantedMissing: () => Effect.die(new Error("not used in test")),
              loadCurrentUnitState: () => Effect.die(new Error("not used in test")),
              mediaExists: () => Effect.die(new Error("not used in test")),
              listAllMediaRows: () => Effect.die(new Error("not used in test")),
              listImportScanMappedUnits: () => Effect.die(new Error("not used in test")),
              listScopedUnitRows: () => Effect.die(new Error("not used in test")),
              listMissingUnitSearchRows: () => Effect.die(new Error("not used in test")),
              loadUnitsByNumbers: () => Effect.die(new Error("not used in test")),
              findMediaByExactRootFolder: () => Effect.die(new Error("not used in test")),
              requireMediaExists: () => Effect.die(new Error("not used in test")),
              deleteMedia: () => Effect.die(new Error("not used in test")),
              insertMediaAggregate: () => Effect.die(new Error("not used in test")),
              listMonitoredMediaIds: () => Effect.die(new Error("not used in test")),
              updateMediaRow: () => Effect.die(new Error("not used in test")),
              updateMonitored: () => Effect.die(new Error("not used in test")),
              updateProfileName: () => Effect.die(new Error("not used in test")),
              updateReleaseProfileIds: () => Effect.die(new Error("not used in test")),
              updateRootFolder: () => Effect.die(new Error("not used in test")),
            }),
            Layer.succeed(
              RuntimeConfigSnapshotService,
              makeRuntimeConfigSnapshotStub(
                makeTestConfig("./test.sqlite", (config) => ({
                  ...config,
                  downloads: { ...config.downloads, root_path: "/allowed/downloads" },
                  library: {
                    ...config.library,
                    anime_path: "/allowed/library",
                    manga_path: "/allowed/library/manga",
                    light_novel_path: "/allowed/library/light-novels",
                    recycle_path: "/allowed/recycle",
                  },
                })),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function makeScanFileSystem(overrides: Partial<FileSystemShape>) {
  return {
    copyFile: () => Effect.void,
    mkdir: () => Effect.void,
    openFile: () => Effect.die(new Error("not used in test")),
    readDir: () => Effect.succeed([]),
    readFile: () => Effect.die(new Error("not used in test")),
    realPath: () => Effect.succeed("/allowed/library"),
    remove: () => Effect.void,
    rename: () => Effect.void,
    stat: () => Effect.die(new Error("not used in test")),
    writeFile: () => Effect.void,
    ...overrides,
  } satisfies FileSystemShape;
}
