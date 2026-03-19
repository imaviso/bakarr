import { Context, Effect, Layer, Schema, Scope, Stream } from "effect";
import { relative, resolve } from "node:path";

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

function wrap<A>(
  path: string | URL,
  message: string,
  promise: () => Promise<A>,
): Effect.Effect<A, FileSystemError> {
  return Effect.tryPromise({
    try: promise,
    catch: (cause) =>
      new FileSystemError({ cause, message, path: path.toString() }),
  });
}

function toOpenOptions(options: OpenFileOptions): Deno.OpenOptions {
  return {
    read: options.read ?? true,
    write: options.write ?? false,
    append: options.append ?? false,
    create: options.create ?? false,
    truncate: options.truncate ?? false,
  };
}

function toMkdirOptions(options?: MkdirOptions): Deno.MkdirOptions | undefined {
  if (!options) return undefined;
  return {
    recursive: options.recursive,
    mode: options.mode,
  };
}

function toRemoveOptions(
  options?: RemoveOptions,
): Deno.RemoveOptions | undefined {
  if (!options) return undefined;
  return {
    recursive: options.recursive,
  };
}

function toFileInfo(info: Deno.FileInfo): FileInfo {
  return {
    isDirectory: info.isDirectory ?? false,
    isFile: info.isFile ?? false,
    isSymlink: info.isSymlink ?? false,
    size: info.size ?? 0,
  };
}

function toDirEntry(entry: Deno.DirEntry): DirEntry {
  return {
    name: entry.name,
    isDirectory: entry.isDirectory,
    isFile: entry.isFile,
    isSymlink: entry.isSymlink,
  };
}

const makeFileSystem: FileSystemShape = {
  openFile: (path, options) =>
    Effect.acquireRelease(
      wrap(path, "Failed to open file", () =>
        Deno.open(path, toOpenOptions(options))),
      (file) =>
        Effect.sync(() =>
          file.close()
        ),
    ),
  readFile: (path) =>
    wrap(path, "Failed to read file", () => Deno.readFile(path)),
  readDir: (path) =>
    wrap(
      path,
      "Failed to read directory",
      async () => {
        const entries: Deno.DirEntry[] = [];
        for await (const entry of Deno.readDir(path)) {
          entries.push(entry);
        }
        return entries.map(toDirEntry);
      },
    ),
  readDirStream: (path) =>
    Stream.fromAsyncIterable(
      Deno.readDir(path),
      (cause) =>
        new FileSystemError({
          cause,
          message: "Failed to read directory",
          path: path.toString(),
        }),
    ).pipe(Stream.map(toDirEntry)),
  realPath: (path) =>
    wrap(path, "Failed to resolve path", () => Deno.realPath(path)),
  stat: (path) =>
    wrap(path, "Failed to stat path", async () => {
      const info = await Deno.stat(path);
      return toFileInfo(info);
    }),
  mkdir: (path, options) =>
    wrap(
      path,
      "Failed to create directory",
      () => Deno.mkdir(path, toMkdirOptions(options)),
    ),
  rename: (from, to) =>
    wrap(from, "Failed to rename", () => Deno.rename(from, to)),
  copyFile: (from, to) =>
    wrap(from, "Failed to copy file", () => Deno.copyFile(from, to)),
  writeFile: (path, data) =>
    wrap(path, "Failed to write file", () => Deno.writeFile(path, data)),
  remove: (path, options) =>
    wrap(
      path,
      "Failed to remove",
      () => Deno.remove(path, toRemoveOptions(options)),
    ),
};

export const FileSystemLive = Layer.succeed(FileSystem, makeFileSystem);

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
