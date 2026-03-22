import { FileSystem as PlatformFileSystem } from "@effect/platform";
import { Effect } from "effect";

import {
  FileSystem,
  FileSystemLive,
  type FileSystemShape,
  makeFileSystemNoopLayer,
} from "../lib/filesystem.ts";
import { runTestEffect } from "./effect-test.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function makeTestFileSystem(): Promise<FileSystemShape> {
  return await runTestEffect(
    FileSystem.pipe(Effect.provide(FileSystemLive)),
  );
}

export async function makeNoopTestFileSystem(
  overrides: Partial<PlatformFileSystem.FileSystem>,
): Promise<FileSystemShape> {
  return await runTestEffect(
    FileSystem.pipe(Effect.provide(makeFileSystemNoopLayer(overrides))),
  );
}

export async function makeNoopTestFileSystemWithOverrides(
  overrides: Partial<FileSystemShape>,
): Promise<FileSystemShape> {
  const base = await makeNoopTestFileSystem({});
  return { ...base, ...overrides };
}

export async function withFileSystemSandbox<A>(
  run: (input: { fs: FileSystemShape; root: string }) => Promise<A>,
): Promise<A> {
  const fs = await makeTestFileSystem();
  const root = `/tmp/bakarr-api-test-${crypto.randomUUID()}`;

  await runTestEffect(fs.mkdir(root, { recursive: true }));

  try {
    return await run({ fs, root });
  } finally {
    await runTestEffect(
      fs.remove(root, { recursive: true }).pipe(
        Effect.catchAll(() => Effect.void),
      ),
    );
  }
}

export function writeTextFile(
  fs: FileSystemShape,
  path: string,
  contents: string,
) {
  return fs.writeFile(path, textEncoder.encode(contents));
}

export function readTextFile(fs: FileSystemShape, path: string) {
  return fs.readFile(path).pipe(
    Effect.map((bytes) => textDecoder.decode(bytes)),
  );
}

export function exists(fs: FileSystemShape, path: string) {
  return fs.stat(path).pipe(
    Effect.as(true),
    Effect.catchAll(() => Effect.succeed(false)),
  );
}
