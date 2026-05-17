import { FileSystem as PlatformFileSystem } from "@effect/platform";
import { Effect, Scope } from "effect";

import {
  FileSystem,
  FileSystemLive,
  type FileSystemShape,
  makeFileSystemNoopLayer,
} from "@/infra/filesystem/filesystem.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const makeTestFileSystemEffect = Effect.fn("Test.makeTestFileSystemEffect")(function* () {
  return yield* FileSystem.pipe(Effect.provide(FileSystemLive));
});

export const makeNoopTestFileSystemEffect = Effect.fn("Test.makeNoopTestFileSystemEffect")(
  function* (overrides: Partial<PlatformFileSystem.FileSystem>) {
    return yield* FileSystem.pipe(Effect.provide(makeFileSystemNoopLayer(overrides)));
  },
);

export const makeNoopTestFileSystemWithOverridesEffect = Effect.fn(
  "Test.makeNoopTestFileSystemWithOverridesEffect",
)(function* (overrides: Partial<FileSystemShape>) {
  const base = yield* makeNoopTestFileSystemEffect({});
  return { ...base, ...overrides };
});

export const withFileSystemSandboxEffect = Effect.fn("Test.withFileSystemSandboxEffect")(function* <
  A,
  E,
  R,
>(run: (input: { fs: FileSystemShape; root: string }) => Effect.Effect<A, E, R>) {
  yield* Scope.Scope;
  const fs = yield* makeTestFileSystemEffect();
  const root = `/tmp/bakarr-api-test-${crypto.randomUUID()}`;

  yield* fs.mkdir(root, { recursive: true });
  yield* Effect.addFinalizer(() =>
    fs.remove(root, { recursive: true }).pipe(Effect.catchAll(() => Effect.void)),
  );

  return yield* run({ fs, root });
});

export function writeTextFile(fs: FileSystemShape, path: string, contents: string) {
  return fs.writeFile(path, textEncoder.encode(contents));
}

export function readTextFile(fs: FileSystemShape, path: string) {
  return fs.readFile(path).pipe(Effect.map((bytes) => textDecoder.decode(bytes)));
}

export function exists(fs: FileSystemShape, path: string) {
  return fs.stat(path).pipe(
    Effect.as(true),
    Effect.catchAll(() => Effect.succeed(false)),
  );
}
