import { Cause, Effect, Exit, Layer } from "effect";

import { assert, describe, it } from "@effect/vitest";
import { Database } from "@/db/database.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import {
  ImportPathScanService,
  ImportPathScanServiceLive,
} from "@/features/operations/import-path-scan-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { FileSystem, type FileSystemShape } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { makeRuntimeConfigSnapshotStub } from "@/test/stubs.ts";

describe("ImportPathScanService", () => {
  it.effect("rejects paths outside library, recycle, and downloads roots", () =>
    Effect.gen(function* () {
      const fs = makeScanFileSystem({
        realPath: () => Effect.succeed("/outside/imports"),
      });

      const exit = yield* Effect.exit(
        scanImportPathEffect(fs, {
          path: "/outside/imports",
        }),
      );

      assert.deepStrictEqual(exit._tag, "Failure");

      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");

        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value._tag, "OperationsInputError");
          assert.deepStrictEqual(
            failure.value.message,
            "Import path must be inside library, recycle, or downloads root",
          );
        }
      }
    }),
  );
});

function scanImportPathEffect(
  fs: FileSystemShape,
  input: {
    readonly animeId?: number;
    readonly limit?: number;
    readonly path: string;
  },
) {
  return Effect.flatMap(ImportPathScanService, (service) => service.scanImportPath(input)).pipe(
    Effect.provide(
      ImportPathScanServiceLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(Database, {
              get client(): never {
                return Effect.runSync(Effect.dieMessage("test database stub"));
              },
              db: undefined!,
            }),
            Layer.succeed(AniListClient, {
              getAnimeMetadataById: () => Effect.dieMessage("not used in test"),
              searchAnimeMetadata: () => Effect.dieMessage("not used in test"),
            }),
            Layer.succeed(FileSystem, fs),
            Layer.succeed(MediaProbe, {
              probeVideoFile: () => Effect.dieMessage("not used in test"),
            }),
            Layer.succeed(
              RuntimeConfigSnapshotService,
              makeRuntimeConfigSnapshotStub(
                makeTestConfig("./test.sqlite", (config) => ({
                  ...config,
                  downloads: { ...config.downloads, root_path: "/allowed/downloads" },
                  library: {
                    ...config.library,
                    library_path: "/allowed/library",
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
