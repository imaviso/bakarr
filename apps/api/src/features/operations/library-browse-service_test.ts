import { Cause, Effect, Exit, Layer } from "effect";

import { assertEquals, describe, it } from "@/test/vitest.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { FileSystem, FileSystemError, type FileSystemShape } from "@/lib/filesystem.ts";
import {
  LibraryBrowseService,
  LibraryBrowseServiceLive,
} from "@/features/operations/library-browse-service.ts";
import {
  LibraryRootsQueryService,
  type LibraryRootsQueryServiceShape,
} from "@/features/operations/library-roots-query-service.ts";
import {
  SystemConfigService,
  type SystemConfigServiceShape,
} from "@/features/system/system-config-service.ts";

describe("LibraryBrowseService", () => {
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

      assertEquals(exit._tag, "Failure");

      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assertEquals(failure._tag, "Some");
        if (failure._tag === "Some") {
          assertEquals(failure.value._tag, "OperationsPathError");
        }
      }
    }),
  );

  it.effect("fails when a listed file cannot be statted", () =>
    Effect.gen(function* () {
      const fs = makeBrowseFileSystem({
        readDir: () =>
          Effect.succeed([
            {
              isDirectory: false,
              isFile: true,
              isSymlink: false,
              name: "episode-01.mkv",
            },
          ]),
        stat: () =>
          Effect.fail(
            new FileSystemError({
              cause: new Error("boom"),
              message: "Failed to stat path",
              path: "/allowed/library/episode-01.mkv",
            }),
          ),
      });

      const exit = yield* Effect.exit(
        browseEffect(fs, {
          path: "/allowed/library",
        }),
      );

      assertEquals(exit._tag, "Failure");

      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assertEquals(failure._tag, "Some");
        if (failure._tag === "Some") {
          assertEquals(failure.value._tag, "OperationsPathError");
        }
      }
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
            Layer.succeed(LibraryRootsQueryService, {
              listRoots: () =>
                Effect.succeed([{ id: 1, label: "default", path: "/allowed/library" }]),
            } satisfies LibraryRootsQueryServiceShape),
            Layer.succeed(SystemConfigService, {
              getConfig: () => Effect.succeed(makeTestConfig("./test.sqlite")),
            } satisfies SystemConfigServiceShape),
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
