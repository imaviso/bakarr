import { Context, Effect, Layer, Schema, Scope } from "effect";
import { resolve } from "node:path";

export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
  "FileSystemError",
  { cause: Schema.Defect, message: Schema.String, path: Schema.String },
) {}

export interface FileSystemShape {
  readonly openFile: (
    path: string | URL,
    options: Deno.OpenOptions,
  ) => Effect.Effect<Deno.FsFile, FileSystemError, Scope.Scope>;
  readonly readFile: (
    path: string | URL,
  ) => Effect.Effect<Uint8Array, FileSystemError>;
  readonly readDir: (
    path: string | URL,
  ) => Effect.Effect<Deno.DirEntry[], FileSystemError>;
  readonly realPath: (
    path: string | URL,
  ) => Effect.Effect<string, FileSystemError>;
  readonly stat: (
    path: string | URL,
  ) => Effect.Effect<Deno.FileInfo, FileSystemError>;
  readonly mkdir: (
    path: string | URL,
    options?: Deno.MkdirOptions,
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
    options?: Deno.RemoveOptions,
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

const makeFileSystem: FileSystemShape = {
  openFile: (path, options) =>
    Effect.acquireRelease(
      wrap(path, "Failed to open file", () => Deno.open(path, options)),
      (file) => Effect.sync(() => file.close()),
    ),
  readFile: (path) =>
    wrap(path, "Failed to read file", () => Deno.readFile(path)),
  readDir: (path) =>
    wrap(
      path,
      "Failed to read directory",
      () => Array.fromAsync(Deno.readDir(path)),
    ),
  realPath: (path) =>
    wrap(path, "Failed to resolve path", () => Deno.realPath(path)),
  stat: (path) => wrap(path, "Failed to stat path", () => Deno.stat(path)),
  mkdir: (path, options) =>
    wrap(path, "Failed to create directory", () => Deno.mkdir(path, options)),
  rename: (from, to) =>
    wrap(from, "Failed to rename", () => Deno.rename(from, to)),
  copyFile: (from, to) =>
    wrap(from, "Failed to copy file", () => Deno.copyFile(from, to)),
  writeFile: (path, data) =>
    wrap(path, "Failed to write file", () => Deno.writeFile(path, data)),
  remove: (path, options) =>
    wrap(path, "Failed to remove", () => Deno.remove(path, options)),
};

export const FileSystemLive = Layer.succeed(FileSystem, makeFileSystem);

export function isWithinPathRoot(path: string, root: string) {
  const resolvedPath = resolve(path.replace(/[\\/]+/g, "/"));
  const resolvedRoot = resolve(root.replace(/[\\/]+/g, "/"));

  return resolvedPath === resolvedRoot ||
    resolvedPath.startsWith(`${resolvedRoot}/`);
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
  return name.replace(/[\\/]/g, " ").replace(/[:*?"<>|]/g, "").replace(
    /\s+/g,
    " ",
  ).trim();
}
