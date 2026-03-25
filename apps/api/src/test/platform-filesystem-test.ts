import { FileSystem as PlatformFileSystem } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { Effect } from "effect";

function runPlatformFs<A>(effect: Effect.Effect<A, unknown, PlatformFileSystem.FileSystem>) {
  return Effect.runPromise(effect.pipe(Effect.provide(BunFileSystem.layer)));
}

export function platformFsMakeTempDir(options?: PlatformFileSystem.MakeTempDirectoryOptions) {
  return runPlatformFs(
    Effect.flatMap(PlatformFileSystem.FileSystem, (fs) => fs.makeTempDirectory(options)),
  );
}

export function platformFsMakeTempFile(options?: PlatformFileSystem.MakeTempFileOptions) {
  return runPlatformFs(
    Effect.flatMap(PlatformFileSystem.FileSystem, (fs) => fs.makeTempFile(options)),
  );
}

export function platformFsRemovePath(path: string, options?: PlatformFileSystem.RemoveOptions) {
  return runPlatformFs(
    Effect.flatMap(PlatformFileSystem.FileSystem, (fs) => fs.remove(path, options)),
  );
}

export function platformFsMkdirPath(
  path: string,
  options?: PlatformFileSystem.MakeDirectoryOptions,
) {
  return runPlatformFs(
    Effect.flatMap(PlatformFileSystem.FileSystem, (fs) => fs.makeDirectory(path, options)),
  );
}

export function platformFsWriteTextFile(path: string, data: string) {
  return runPlatformFs(
    Effect.flatMap(PlatformFileSystem.FileSystem, (fs) => fs.writeFileString(path, data)),
  );
}

export function platformFsWriteBinaryFile(path: string, data: Uint8Array) {
  return runPlatformFs(
    Effect.flatMap(PlatformFileSystem.FileSystem, (fs) => fs.writeFile(path, data)),
  );
}

export function platformFsStatPath(path: string) {
  return runPlatformFs(Effect.flatMap(PlatformFileSystem.FileSystem, (fs) => fs.stat(path)));
}

export const platformFsTest = {
  makeTempDir: platformFsMakeTempDir,
  makeTempFile: platformFsMakeTempFile,
  mkdirPath: platformFsMkdirPath,
  removePath: platformFsRemovePath,
  statPath: platformFsStatPath,
  writeBinaryFile: platformFsWriteBinaryFile,
  writeTextFile: platformFsWriteTextFile,
} as const;
