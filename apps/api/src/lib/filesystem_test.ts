import { FileSystem as PlatformFileSystem } from "@effect/platform";
import { Cause, Effect } from "effect";

import { assertEquals, assertInstanceOf, assertThrows, it } from "../test/vitest.ts";
import { makeNoopTestFileSystemEffect } from "../test/filesystem-test.ts";

import {
  FileSystemError,
  PathSegmentError,
  isWithinPathRoot,
  sanitizePathSegment,
  sanitizePathSegmentEffect,
} from "./filesystem.ts";

it("isWithinPathRoot only matches the configured root boundary", () => {
  assertEquals(isWithinPathRoot("/data/downloads", "/data/downloads"), true);
  assertEquals(isWithinPathRoot("/data/downloads/show/episode.mkv", "/data/downloads"), true);
  assertEquals(isWithinPathRoot("/data/downloads-evil/show/episode.mkv", "/data/downloads"), false);
  assertEquals(isWithinPathRoot("/data/downloads-other", "/data/downloads/"), false);
});

it("isWithinPathRoot accepts Windows-style child paths", () => {
  assertEquals(isWithinPathRoot("C:\\downloads\\show\\episode.mkv", "C:\\downloads"), true);
  assertEquals(isWithinPathRoot("C:\\downloads-evil\\show\\episode.mkv", "C:\\downloads"), false);
});

it("isWithinPathRoot handles relative paths", () => {
  assertEquals(isWithinPathRoot("./library/show/episode.mkv", "./library"), true);
  assertEquals(isWithinPathRoot("./library-evil/show/episode.mkv", "./library"), false);
});

it("sanitizePathSegment rejects traversal and nested path inputs", () => {
  for (const value of ["../etc", "..", "nested/show", "nested\\show", ""]) {
    assertThrows(() => sanitizePathSegment(value), PathSegmentError);
  }
});

it("sanitizePathSegment allows plain folder names within root", () => {
  const segment = sanitizePathSegment("My Show Season 2");
  const libraryRoot = "/library";
  const folderPath = `${libraryRoot}/${segment}`;

  assertEquals(segment, "My Show Season 2");
  assertEquals(isWithinPathRoot(folderPath, libraryRoot), true);
});

it.effect("sanitizePathSegmentEffect rejects traversal inputs with typed errors", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(sanitizePathSegmentEffect("nested/show"));

    assertEquals(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");

      if (failure._tag === "Some") {
        assertInstanceOf(failure.value, PathSegmentError);
        assertEquals(failure.value.message, "Invalid path segment");
      }
    }
  }),
);

it.effect("openFile.seek rejects unsupported seek modes with typed errors", () =>
  Effect.gen(function* () {
    const fs = yield* makeNoopTestFileSystemEffect({
      open: () => Effect.succeed(makeFakePlatformFile()),
    });

    const exit = yield* Effect.exit(
      Effect.scoped(
        fs
          .openFile("/tmp/example.mkv", { read: true })
          .pipe(Effect.flatMap((file) => file.seek(0, 2))),
      ),
    );

    assertEquals(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");

      if (failure._tag === "Some") {
        assertInstanceOf(failure.value, FileSystemError);
        assertEquals(failure.value.message, "Unsupported seek mode: 2");
      }
    }
  }),
);

function makeFakePlatformFile(): PlatformFileSystem.File {
  return {
    [PlatformFileSystem.FileTypeId]: PlatformFileSystem.FileTypeId,
    fd: 0 as PlatformFileSystem.File.Descriptor,
    read: () => Effect.die("unexpected read call"),
    readAlloc: () => Effect.die("unexpected readAlloc call"),
    seek: () => Effect.die("unexpected seek call"),
    stat: Effect.die("unexpected stat call"),
    sync: Effect.void,
    truncate: () => Effect.die("unexpected truncate call"),
    write: () => Effect.die("unexpected write call"),
    writeAll: () => Effect.die("unexpected writeAll call"),
  };
}
