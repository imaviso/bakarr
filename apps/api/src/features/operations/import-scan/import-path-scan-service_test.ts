import { Cause, Effect, Exit, Layer } from "effect";

import { assert, describe, it } from "@effect/vitest";
import { AppDrizzleDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { ImportPathScanService } from "@/features/operations/import-scan/import-path-scan-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { makeRuntimeConfigSnapshotStub } from "@/test/stubs.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";

describe("ImportPathScanService", () => {
  it.scoped("rejects paths outside library, recycle, and downloads roots", () =>
    withSqliteTestDbEffect({
      schema,
      run: (db) =>
        Effect.gen(function* () {
          const fs = makeScanFileSystem({
            realPath: () => Effect.succeed("/outside/imports"),
          });

          const exit = yield* Effect.exit(
            scanImportPathEffect(fs, AppDrizzleDatabase.make(db), {
              path: "/outside/imports",
            }),
          );

          assert.deepStrictEqual(exit._tag, "Failure");

          if (Exit.isFailure(exit)) {
            const failure = Cause.failureOption(exit.cause);
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
  database: AppDrizzleDatabase,
  input: {
    readonly mediaId?: number;
    readonly limit?: number;
    readonly path: string;
  },
) {
  return Effect.flatMap(ImportPathScanService, (service) => service.scanImportPath(input)).pipe(
    Effect.provide(
      ImportPathScanService.DefaultWithoutDependencies.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(AppDrizzleDatabase, database),
            Layer.succeed(
              AniListClient,
              AniListClient.make({
                getAnimeMetadataById: () => Effect.dieMessage("not used in test"),
                searchAnimeMetadata: () => Effect.dieMessage("not used in test"),
                getSeasonalAnime: () => Effect.dieMessage("not used in test"),
              }),
            ),
            Layer.succeed(FileSystem, FileSystem.make(fs)),
            Layer.succeed(
              MediaProbe,
              MediaProbe.make({
                probeVideoFile: () => Effect.dieMessage("not used in test"),
              }),
            ),
            Layer.succeed(
              MediaReadRepository,
              MediaReadRepository.make({
                countMedia: () => Effect.dieMessage("not used in test"),
                findExistingMediaIds: () => Effect.dieMessage("not used in test"),
                findMediaRootFolderOwner: () => Effect.dieMessage("not used in test"),
                getMediaRow: () => Effect.dieMessage("not used in test"),
                getEpisodeRow: () => Effect.dieMessage("not used in test"),
                listCalendarEvents: () => Effect.dieMessage("not used in test"),
                listMappedUnitRows: () => Effect.dieMessage("not used in test"),
                listMediaRows: () => Effect.dieMessage("not used in test"),
                listMissingUnitNumbers: () => Effect.dieMessage("not used in test"),
                listUnitProgressStats: () => Effect.dieMessage("not used in test"),
                listUnitRowsByMediaId: () => Effect.dieMessage("not used in test"),
                listUnitRowsWithMediaKind: () => Effect.dieMessage("not used in test"),
                listWantedMissing: () => Effect.dieMessage("not used in test"),
                loadCurrentEpisodeState: () => Effect.dieMessage("not used in test"),
                mediaExists: () => Effect.dieMessage("not used in test"),
                listAllMediaRows: () => Effect.dieMessage("not used in test"),
                listImportScanMappedUnits: () => Effect.dieMessage("not used in test"),
                listScopedUnitRows: () => Effect.dieMessage("not used in test"),
                listMissingUnitSearchRows: () => Effect.dieMessage("not used in test"),
                findMediaByExactRootFolder: () => Effect.dieMessage("not used in test"),
                requireMediaExists: () => Effect.dieMessage("not used in test"),
                deleteMedia: () => Effect.dieMessage("not used in test"),
                insertMediaAggregate: () => Effect.dieMessage("not used in test"),
                listMonitoredMediaIds: () => Effect.dieMessage("not used in test"),
                updateMediaRow: () => Effect.dieMessage("not used in test"),
                updateMonitored: () => Effect.dieMessage("not used in test"),
                updateProfileName: () => Effect.dieMessage("not used in test"),
                updateReleaseProfileIds: () => Effect.dieMessage("not used in test"),
                updateRootFolder: () => Effect.dieMessage("not used in test"),
              }),
            ),
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
    openFile: () => Effect.dieMessage("not used in test"),
    readDir: () => Effect.succeed([]),
    readFile: () => Effect.dieMessage("not used in test"),
    realPath: () => Effect.succeed("/allowed/library"),
    remove: () => Effect.void,
    rename: () => Effect.void,
    stat: () => Effect.dieMessage("not used in test"),
    writeFile: () => Effect.void,
    ...overrides,
  } satisfies FileSystemShape;
}
