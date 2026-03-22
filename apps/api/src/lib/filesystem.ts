import { FileSystem as PlatformFileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Context, Effect, Layer, Schema, Scope, Stream } from "effect";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
  "FileSystemError",
  { cause: Schema.Defect, message: Schema.String, path: Schema.String },
) {}

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

export interface FileSystemShape {
  readonly openFile: (
    path: string | URL,
    options: OpenFileOptions,
  ) => Effect.Effect<Deno.FsFile, FileSystemError, Scope.Scope>;
  readonly readFile: (
    path: string | URL,
  ) => Effect.Effect<Uint8Array, FileSystemError>;
  readonly readDir: (
    path: string | URL,
  ) => Effect.Effect<DirEntry[], FileSystemError>;
  readonly readDirStream?: (
    path: string | URL,
  ) => Stream.Stream<DirEntry, FileSystemError>;
  readonly realPath: (
    path: string | URL,
  ) => Effect.Effect<string, FileSystemError>;
  readonly stat: (
    path: string | URL,
  ) => Effect.Effect<FileInfo, FileSystemError>;
  readonly mkdir: (
    path: string | URL,
    options?: MkdirOptions,
  ) => Effect.Effect<void, FileSystemError>;
  readonly rename: (
    from: string,
    to: string,
  ) => Effect.Effect<void, FileSystemError>;
  readonly copyFile: (
    from: string,
    to: string,
  ) => Effect.Effect<void, FileSystemError>;
  readonly writeFile: (
    path: string | URL,
    data: Uint8Array,
  ) => Effect.Effect<void, FileSystemError>;
  readonly remove: (
    path: string | URL,
    options?: RemoveOptions,
  ) => Effect.Effect<void, FileSystemError>;
}

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
    Effect.mapError((cause) =>
      new FileSystemError({ cause, message, path: path.toString() })
    ),
  );
}

function toPath(path: string | URL): string {
  if (typeof path === "string") {
    return path;
  }

  if (path.protocol === "file:") {
    return fileURLToPath(path);
  }

  return path.toString();
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

  if (write) {
    if (truncate || create) {
      return read ? "w+" : "w";
    }

    return read ? "r+" : "w";
  }

  return "r";
}

function toMkdirOptions(
  options?: MkdirOptions,
): PlatformFileSystem.MakeDirectoryOptions | undefined {
  if (!options) return undefined;
  return {
    recursive: options.recursive,
    mode: options.mode,
  };
}

function toRemoveOptions(
  options?: RemoveOptions,
): PlatformFileSystem.RemoveOptions | undefined {
  if (!options) return undefined;
  return {
    force: true,
    recursive: options.recursive,
  };
}

function toFileInfo(info: PlatformFileSystem.File.Info): FileInfo {
  return {
    isDirectory: info.type === "Directory",
    isFile: info.type === "File",
    isSymlink: info.type === "SymbolicLink",
    size: Number(info.size),
  };
}

function toDirEntry(
  name: string,
  info: PlatformFileSystem.File.Info,
): DirEntry {
  return {
    name,
    isDirectory: info.type === "Directory",
    isFile: info.type === "File",
    isSymlink: info.type === "SymbolicLink",
  };
}

function toSeekMode(mode: number): "current" | "start" {
  if (mode === Deno.SeekMode.Start || mode === 0) {
    return "start";
  }

  if (mode === Deno.SeekMode.Current || mode === 1) {
    return "current";
  }

  throw new Error(`Unsupported seek mode: ${mode}`);
}

function toOpenFileHandle(file: PlatformFileSystem.File): Deno.FsFile {
  return {
    close: () => {
      // Closed by scope.
    },
    read: (buffer: Uint8Array) =>
      Effect.runPromise(file.read(buffer)).then((size) => {
        const bytesRead = Number(size);
        return bytesRead === 0 ? null : bytesRead;
      }),
    seek: (offset: number, mode: number) =>
      Effect.runPromise(file.seek(BigInt(offset), toSeekMode(mode))),
  } as unknown as Deno.FsFile;
}

function makeFileSystem(
  platformFs: PlatformFileSystem.FileSystem,
): FileSystemShape {
  return {
    openFile: (path, options) =>
      wrap(
        path,
        "Failed to open file",
        platformFs.open(toPath(path), {
          flag: toOpenFlag(options),
        }),
      ).pipe(
        Effect.map(toOpenFileHandle),
      ),
    readFile: (path) =>
      wrap(
        path,
        "Failed to read file",
        Effect.scoped(platformFs.readFile(toPath(path))),
      ),
    readDir: (path) =>
      wrap(
        path,
        "Failed to read directory",
        Effect.scoped(platformFs.readDirectory(toPath(path))).pipe(
          Effect.flatMap((names) =>
            Effect.forEach(
              names,
              (name) =>
                Effect.scoped(platformFs.stat(join(toPath(path), name))).pipe(
                  Effect.map((info) => toDirEntry(name, info)),
                ),
              { concurrency: "unbounded" },
            )
          ),
        ),
      ),
    readDirStream: (path) =>
      Stream.fromEffect(
        wrap(
          path,
          "Failed to read directory",
          Effect.scoped(platformFs.readDirectory(toPath(path))),
        ),
      ).pipe(
        Stream.flatMap((names) =>
          Stream.fromIterable(names).pipe(
            Stream.mapEffect((name) =>
              wrap(
                join(toPath(path), name),
                "Failed to read directory",
                Effect.scoped(platformFs.stat(join(toPath(path), name))),
              ).pipe(
                Effect.map((info) => toDirEntry(name, info)),
              )
            ),
          )
        ),
      ),
    realPath: (path) =>
      wrap(
        path,
        "Failed to resolve path",
        Effect.scoped(platformFs.realPath(toPath(path))),
      ),
    stat: (path) =>
      wrap(
        path,
        "Failed to stat path",
        Effect.scoped(platformFs.stat(toPath(path))),
      ).pipe(
        Effect.map(toFileInfo),
      ),
    mkdir: (path, options) =>
      wrap(
        path,
        "Failed to create directory",
        Effect.scoped(
          platformFs.makeDirectory(toPath(path), toMkdirOptions(options)),
        ),
      ),
    rename: (from, to) =>
      wrap(
        from,
        "Failed to rename",
        Effect.scoped(platformFs.rename(from, to)),
      ),
    copyFile: (from, to) =>
      wrap(
        from,
        "Failed to copy file",
        Effect.scoped(platformFs.copyFile(from, to)),
      ),
    writeFile: (path, data) =>
      wrap(
        path,
        "Failed to write file",
        Effect.scoped(platformFs.writeFile(toPath(path), data)),
      ),
    remove: (path, options) =>
      wrap(
        path,
        "Failed to remove",
        Effect.scoped(
          platformFs.remove(toPath(path), toRemoveOptions(options)),
        ),
      ),
  };
}

const FileSystemFromPlatform = Layer.effect(
  FileSystem,
  Effect.gen(function* () {
    const platformFs = yield* PlatformFileSystem.FileSystem;
    return makeFileSystem(platformFs);
  }),
);

export const FileSystemLive = FileSystemFromPlatform.pipe(
  Layer.provide(NodeFileSystem.layer),
);

export const FileSystemNoop = FileSystemFromPlatform.pipe(
  Layer.provide(PlatformFileSystem.layerNoop({})),
);

export function makeFileSystemNoopLayer(
  overrides: Partial<PlatformFileSystem.FileSystem>,
) {
  return FileSystemFromPlatform.pipe(
    Layer.provide(PlatformFileSystem.layerNoop(overrides)),
  );
}

export function isWithinPathRoot(path: string, root: string) {
  const resolvedPath = resolve(path.replace(/[\\/]+/g, "/"));
  const resolvedRoot = resolve(root.replace(/[\\/]+/g, "/"));

  if (resolvedPath === resolvedRoot) {
    return true;
  }

  const relativePath = relative(resolvedRoot, resolvedPath);

  if (relativePath === "") {
    return true;
  }

  if (
    relativePath.startsWith("..") || relativePath.startsWith("/") ||
    relativePath.startsWith("\\")
  ) {
    return false;
  }

  return true;
}

export function sanitizePathSegment(value: string) {
  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new Error("Invalid path segment");
  }

  return trimmed;
}

export function sanitizeFilename(name: string) {
  return name.replace(/[\\/:]/g, " ").replace(/[*?"<>|]/g, "").replace(
    /\s+/g,
    " ",
  ).trim();
}
