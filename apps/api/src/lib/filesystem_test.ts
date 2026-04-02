import { FileSystem as PlatformFileSystem } from "@effect/platform";
import { Cause, Effect } from "effect";

import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { makeNoopTestFileSystemEffect } from "@/test/filesystem-test.ts";

import {
  FileSystemError,
  PathSegmentError,
  isWithinPathRoot,
  sanitizePathSegment,
  sanitizePathSegmentEffect,
} from "@/lib/filesystem.ts";

it("isWithinPathRoot only matches the configured root boundary", () => {
  assert.deepStrictEqual(isWithinPathRoot("/data/downloads", "/data/downloads"), true);
  assert.deepStrictEqual(
    isWithinPathRoot("/data/downloads/show/episode.mkv", "/data/downloads"),
    true,
  );
  assert.deepStrictEqual(
    isWithinPathRoot("/data/downloads-evil/show/episode.mkv", "/data/downloads"),
    false,
  );
  assert.deepStrictEqual(isWithinPathRoot("/data/downloads-other", "/data/downloads/"), false);
});

it("isWithinPathRoot accepts Windows-style child paths", () => {
  assert.deepStrictEqual(
    isWithinPathRoot("C:\\downloads\\show\\episode.mkv", "C:\\downloads"),
    true,
  );
  assert.deepStrictEqual(
    isWithinPathRoot("C:\\downloads-evil\\show\\episode.mkv", "C:\\downloads"),
    false,
  );
});

it("isWithinPathRoot handles relative paths", () => {
  assert.deepStrictEqual(isWithinPathRoot("./library/show/episode.mkv", "./library"), true);
  assert.deepStrictEqual(isWithinPathRoot("./library-evil/show/episode.mkv", "./library"), false);
});

it("sanitizePathSegment rejects traversal and nested path inputs", () => {
  for (const value of ["../etc", "..", "nested/show", "nested\\show", ""]) {
    assert.throws(() => sanitizePathSegment(value), PathSegmentError);
  }
});

it("sanitizePathSegment allows plain folder names within root", () => {
  const segment = sanitizePathSegment("My Show Season 2");
  const libraryRoot = "/library";
  const folderPath = `${libraryRoot}/${segment}`;

  assert.deepStrictEqual(segment, "My Show Season 2");
  assert.deepStrictEqual(isWithinPathRoot(folderPath, libraryRoot), true);
});

it.effect("sanitizePathSegmentEffect rejects traversal inputs with typed errors", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(sanitizePathSegmentEffect("nested/show"));

    assert.deepStrictEqual(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");

      if (failure._tag === "Some") {
        assert.ok(failure.value instanceof PathSegmentError);
        assert.deepStrictEqual(failure.value.message, "Invalid path segment");
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

    assert.deepStrictEqual(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");

      if (failure._tag === "Some") {
        assert.ok(failure.value instanceof FileSystemError);
        assert.deepStrictEqual(failure.value.message, "Unsupported seek mode: 2");
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
