import { Context, Effect, Layer, Schema } from "effect";

export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
  "FileSystemError",
  { cause: Schema.Defect, message: Schema.String, path: Schema.String },
) {}

export interface FileSystemShape {
  readonly readDir: (
    path: string,
  ) => Effect.Effect<Deno.DirEntry[], FileSystemError>;
  readonly realPath: (
    path: string,
  ) => Effect.Effect<string, FileSystemError>;
  readonly stat: (
    path: string,
  ) => Effect.Effect<Deno.FileInfo, FileSystemError>;
  readonly mkdir: (
    path: string,
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
  readonly remove: (
    path: string,
    options?: Deno.RemoveOptions,
  ) => Effect.Effect<void, FileSystemError>;
}

export class FileSystem extends Context.Tag("@bakarr/api/FileSystem")<
  FileSystem,
  FileSystemShape
>() {}

function wrap<A>(
  path: string,
  message: string,
  promise: () => Promise<A>,
): Effect.Effect<A, FileSystemError> {
  return Effect.tryPromise({
    try: promise,
    catch: (cause) => new FileSystemError({ cause, message, path }),
  });
}

const makeFileSystem: FileSystemShape = {
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
  remove: (path, options) =>
    wrap(path, "Failed to remove", () => Deno.remove(path, options)),
};

export const FileSystemLive = Layer.succeed(FileSystem, makeFileSystem);

export function isWithinPathRoot(path: string, root: string) {
  const normalizedRoot = root.replace(/\/+$/, "");
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`);
}
