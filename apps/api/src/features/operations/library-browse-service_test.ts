import { Cause, Effect, Exit, Layer } from "effect";

import { assert, describe, it } from "@effect/vitest";
import { makeTestConfig } from "@/test/config-fixture.ts";
import {
  FileSystem,
  FileSystemError,
  type FileSystemShape,
} from "@/infra/filesystem/filesystem.ts";
import { makeRuntimeConfigSnapshotStub } from "@/test/stubs.ts";
import {
  LibraryBrowseService,
  LibraryBrowseServiceLive,
} from "@/features/operations/library-browse-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";

describe("LibraryBrowseService", () => {
  it.effect("applies a default bounded limit when omitted", () =>
    Effect.gen(function* () {
      const fs = makeBrowseFileSystem({
        readDir: () =>
          Effect.succeed(
            Array.from({ length: 150 }, (_, index) => ({
              isDirectory: false,
              isFile: true,
              isSymlink: false,
              name: `episode-${String(index + 1).padStart(3, "0")}.mkv`,
              size: index + 1,
            })),
          ),
      });

      const result = yield* browseEffect(fs, {
        path: "/allowed/library",
      });

      assert.deepStrictEqual(result.limit, 100);
      assert.deepStrictEqual(result.entries.length, 100);
      assert.deepStrictEqual(result.has_more, true);
      assert.deepStrictEqual(result.total, 150);
    }),
  );

  it.effect("fails when the requested directory cannot be read", () =>
    Effect.gen(function* () {
      const fs = makeBrowseFileSystem({
        readDir: () =>
          Effect.fail(
            new FileSystemError({
              cause: new Error("boom"),
              message: "Failed to read directory",
              path: "/allowed/library",
            }),
          ),
      });

      const exit = yield* Effect.exit(
        browseEffect(fs, {
          path: "/allowed/library",
        }),
      );

      assert.deepStrictEqual(exit._tag, "Failure");

      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value._tag, "OperationsPathError");
        }
      }
    }),
  );

  it.effect("returns file size from directory entries", () =>
    Effect.gen(function* () {
      const fs = makeBrowseFileSystem({
        readDir: () =>
          Effect.succeed([
            {
              isDirectory: false,
              isFile: true,
              isSymlink: false,
              name: "episode-01.mkv",
              size: 42,
            },
          ]),
      });

      const result = yield* browseEffect(fs, {
        path: "/allowed/library",
      });

      assert.deepStrictEqual(result.entries[0]?.size, 42);
    }),
  );
});

function browseEffect(fs: FileSystemShape, input: { readonly path?: string }) {
  return Effect.flatMap(LibraryBrowseService, (service) => service.browse(input)).pipe(
    Effect.provide(
      LibraryBrowseServiceLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(FileSystem, fs),
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

function makeBrowseFileSystem(overrides: Partial<FileSystemShape>) {
  return {
    copyFile: () => Effect.void,
    mkdir: () => Effect.void,
    openFile: () => Effect.die("not used in test"),
    readDir: () => Effect.succeed([]),
    readFile: () => Effect.die("not used in test"),
    realPath: () => Effect.succeed("/allowed/library"),
    remove: () => Effect.void,
    rename: () => Effect.void,
    stat: () => Effect.succeed({ isDirectory: false, isFile: true, isSymlink: false, size: 1 }),
    writeFile: () => Effect.void,
    ...overrides,
  } satisfies FileSystemShape;
}
