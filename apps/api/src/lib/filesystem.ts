import { FileSystem as PlatformFileSystem, Path as PlatformPath } from "@effect/platform";
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { Context, Effect, Layer, Option, Schema, Scope, Stream } from "effect";

export {
  isWithinPathRoot,
  PathSegmentError,
  sanitizeFilename,
  sanitizePathSegmentEffect,
} from "@/lib/filesystem-path-policy.ts";

export class FileSystemError extends Schema.TaggedError<FileSystemError>()("FileSystemError", {
  cause: Schema.Defect,
  message: Schema.String,
  path: Schema.String,
}) {}

export interface FileInfo {
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly isSymlink: boolean;
  readonly size: number;
}

export interface DirEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly isSymlink: boolean;
  readonly size: number;
}

export interface OpenFileOptions {
  readonly read?: boolean;
  readonly write?: boolean;
  readonly append?: boolean;
  readonly create?: boolean;
  readonly truncate?: boolean;
}

export interface MkdirOptions {
  readonly recursive?: boolean;
  readonly mode?: number;
}

export interface RemoveOptions {
  readonly recursive?: boolean;
}

export interface FileHandle {
  readonly close: () => void;
  readonly read: (buffer: Uint8Array) => Effect.Effect<Option.Option<number>, FileSystemError>;
  readonly seek: (offset: number, mode: number) => Effect.Effect<void, FileSystemError>;
}

export interface FileSystemShape {
  readonly openFile: (
    path: string | URL,
    options: OpenFileOptions,
  ) => Effect.Effect<FileHandle, FileSystemError, Scope.Scope>;
  readonly readFile: (path: string | URL) => Effect.Effect<Uint8Array, FileSystemError>;
  readonly readDir: (path: string | URL) => Effect.Effect<DirEntry[], FileSystemError>;
  readonly readDirStream?: (path: string | URL) => Stream.Stream<DirEntry, FileSystemError>;
  readonly realPath: (path: string | URL) => Effect.Effect<string, FileSystemError>;
  readonly stat: (path: string | URL) => Effect.Effect<FileInfo, FileSystemError>;
  readonly mkdir: (
    path: string | URL,
    options?: MkdirOptions,
  ) => Effect.Effect<void, FileSystemError>;
  readonly rename: (from: string, to: string) => Effect.Effect<void, FileSystemError>;
  readonly copyFile: (from: string, to: string) => Effect.Effect<void, FileSystemError>;
  readonly writeFile: (
    path: string | URL,
    data: Uint8Array,
  ) => Effect.Effect<void, FileSystemError>;
  readonly remove: (
    path: string | URL,
    options?: RemoveOptions,
  ) => Effect.Effect<void, FileSystemError>;
}

const DIRECTORY_STAT_CONCURRENCY = 16;

const FILE_TYPE_FLAGS = {
  Directory: { isDirectory: true, isFile: false, isSymlink: false },
  File: { isDirectory: false, isFile: true, isSymlink: false },
  SymbolicLink: { isDirectory: false, isFile: false, isSymlink: true },
} as const;

const UNKNOWN_FILE_TYPE_FLAGS = {
  isDirectory: false,
  isFile: false,
  isSymlink: false,
} as const;

export class FileSystem extends Context.Tag("@bakarr/api/FileSystem")<
  FileSystem,
  FileSystemShape
>() {}

function wrap<A, R>(
  path: string | URL,
  message: string,
  effect: Effect.Effect<A, unknown, R>,
): Effect.Effect<A, FileSystemError, R> {
  return effect.pipe(
    Effect.mapError((cause) => new FileSystemError({ cause, message, path: path.toString() })),
  );
}

function toOpenFlag(options: OpenFileOptions): PlatformFileSystem.OpenFlag {
  const read = options.read ?? true;
  const write = options.write ?? false;
  const append = options.append ?? false;
  const create = options.create ?? false;
  const truncate = options.truncate ?? false;

  if (append) {
    return read ? "a+" : "a";
  }

  if (!write) {
    return "r";
  }

  return truncate || create ? (read ? "w+" : "w") : read ? "r+" : "w";
}

function toMkdirOptions(
  options?: MkdirOptions,
): PlatformFileSystem.MakeDirectoryOptions | undefined {
  if (!options) return undefined;
  return {
    ...(options.recursive !== undefined ? { recursive: options.recursive } : {}),
    ...(options.mode !== undefined ? { mode: options.mode } : {}),
  };
}

function toRemoveOptions(options?: RemoveOptions): PlatformFileSystem.RemoveOptions | undefined {
  if (!options) return undefined;
  return {
    force: true,
    ...(options.recursive !== undefined ? { recursive: options.recursive } : {}),
  };
}

function toFileInfo(info: PlatformFileSystem.File.Info): FileInfo {
  const typeFlags = toFileTypeFlags(info.type);

  return {
    ...typeFlags,
    size: Number(info.size),
  };
}

function toDirEntry(name: string, info: PlatformFileSystem.File.Info): DirEntry {
  const typeFlags = toFileTypeFlags(info.type);

  return {
    ...typeFlags,
    name,
    size: Number(info.size),
  };
}

function toFileTypeFlags(type: string) {
  switch (type) {
    case "Directory":
      return FILE_TYPE_FLAGS.Directory;
    case "File":
      return FILE_TYPE_FLAGS.File;
    case "SymbolicLink":
      return FILE_TYPE_FLAGS.SymbolicLink;
    default:
      return UNKNOWN_FILE_TYPE_FLAGS;
  }
}

function toOpenFileHandle(file: PlatformFileSystem.File, path: string | URL): FileHandle {
  return {
    close: () => {
      // Closed by scope.
    },
    read: (buffer: Uint8Array) =>
      wrap(path, "Failed to read file", file.read(buffer)).pipe(
        Effect.map((size) => {
          const bytesRead = Number(size);
          return bytesRead === 0 ? Option.none() : Option.some(bytesRead);
        }),
      ),
    seek: (offset: number, mode: number) =>
      resolveSeekMode(path, mode).pipe(
        Effect.flatMap((seekMode) =>
          wrap(path, "Failed to seek file", file.seek(BigInt(offset), seekMode)),
        ),
      ),
  };
}

function makeFileSystem(
  platformFs: PlatformFileSystem.FileSystem,
  pathService: PlatformPath.Path,
): FileSystemShape {
  return {
    openFile: (path, options) =>
      Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
        wrap(
          path,
          "Failed to open file",
          platformFs.open(resolvedPath, {
            flag: toOpenFlag(options),
          }),
        ),
      ).pipe(Effect.map((file) => toOpenFileHandle(file, path))),
    readFile: (path) =>
      Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
        wrap(path, "Failed to read file", Effect.scoped(platformFs.readFile(resolvedPath))),
      ),
    readDir: (path) =>
      Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
        wrap(
          path,
          "Failed to read directory",
          Effect.scoped(platformFs.readDirectory(resolvedPath)).pipe(
            Effect.flatMap((names) =>
              Effect.forEach(
                names,
                (name) =>
                  Effect.scoped(platformFs.stat(pathService.join(resolvedPath, name))).pipe(
                    Effect.map((info) => toDirEntry(name, info)),
                  ),
                { concurrency: DIRECTORY_STAT_CONCURRENCY },
              ),
            ),
          ),
        ),
      ),
    readDirStream: (path) =>
      Stream.fromEffect(
        Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
          wrap(
            path,
            "Failed to read directory",
            Effect.scoped(platformFs.readDirectory(resolvedPath)),
          ).pipe(Effect.map((names) => ({ names, resolvedPath }))),
        ),
      ).pipe(
        Stream.flatMap(({ names, resolvedPath }) =>
          Stream.fromIterable(names).pipe(
            Stream.mapEffect((name) =>
              wrap(
                pathService.join(resolvedPath, name),
                "Failed to read directory",
                Effect.scoped(platformFs.stat(pathService.join(resolvedPath, name))),
              ).pipe(Effect.map((info) => toDirEntry(name, info))),
            ),
          ),
        ),
      ),
    realPath: (path) =>
      Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
        wrap(path, "Failed to resolve path", Effect.scoped(platformFs.realPath(resolvedPath))),
      ),
    stat: (path) =>
      Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
        wrap(path, "Failed to stat path", Effect.scoped(platformFs.stat(resolvedPath))),
      ).pipe(Effect.map(toFileInfo)),
    mkdir: (path, options) =>
      Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
        wrap(
          path,
          "Failed to create directory",
          Effect.scoped(platformFs.makeDirectory(resolvedPath, toMkdirOptions(options))),
        ),
      ),
    rename: (from, to) =>
      wrap(from, "Failed to rename", Effect.scoped(platformFs.rename(from, to))),
    copyFile: (from, to) =>
      wrap(from, "Failed to copy file", Effect.scoped(platformFs.copyFile(from, to))),
    writeFile: (path, data) =>
      Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
        wrap(path, "Failed to write file", Effect.scoped(platformFs.writeFile(resolvedPath, data))),
      ),
    remove: (path, options) =>
      Effect.flatMap(resolvePath(pathService, path), (resolvedPath) =>
        wrap(
          path,
          "Failed to remove",
          Effect.scoped(platformFs.remove(resolvedPath, toRemoveOptions(options))),
        ),
      ),
  };
}

const FileSystemFromPlatform = Layer.effect(
  FileSystem,
  Effect.gen(function* () {
    const platformFs = yield* PlatformFileSystem.FileSystem;
    const pathService = yield* PlatformPath.Path;
    return makeFileSystem(platformFs, pathService);
  }),
);

export const FileSystemLive = FileSystemFromPlatform.pipe(
  Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
);

export const FileSystemNoop = FileSystemFromPlatform.pipe(
  Layer.provide(Layer.mergeAll(PlatformFileSystem.layerNoop({}), BunPath.layer)),
);

export function makeFileSystemNoopLayer(overrides: Partial<PlatformFileSystem.FileSystem>) {
  return FileSystemFromPlatform.pipe(
    Layer.provide(Layer.mergeAll(PlatformFileSystem.layerNoop(overrides), BunPath.layer)),
  );
}

const resolvePath = (
  pathService: PlatformPath.Path,
  path: string | URL,
): Effect.Effect<string, FileSystemError> => {
  if (typeof path === "string") {
    return Effect.succeed(path);
  }

  if (path.protocol === "file:") {
    return pathService.fromFileUrl(path).pipe(
      Effect.mapError(
        (cause) =>
          new FileSystemError({
            cause,
            message: "Failed to convert file URL",
            path: path.toString(),
          }),
      ),
    );
  }

  return Effect.succeed(path.toString());
};

function resolveSeekMode(
  path: string | URL,
  mode: number,
): Effect.Effect<"current" | "start", FileSystemError> {
  if (mode === 0) {
    return Effect.succeed("start");
  }

  if (mode === 1) {
    return Effect.succeed("current");
  }

  return Effect.fail(
    new FileSystemError({
      cause: new Error(`Unsupported seek mode: ${mode}`),
      message: `Unsupported seek mode: ${mode}`,
      path: path.toString(),
    }),
  );
}
