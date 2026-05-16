import { Chunk, Effect, Option, Stream } from "effect";
import {
  FileSystemError,
  type DirEntry,
  type FileSystemShape,
} from "@/infra/filesystem/filesystem.ts";

const SCAN_STAT_CONCURRENCY = 16;

export interface ScannedVideoFile {
  readonly name: string;
  readonly path: string;
  readonly size: number;
}

export const scanVideoFiles = Effect.fn("Operations.scanVideoFiles")(function* (
  fs: FileSystemShape,
  path: string,
) {
  const files = yield* Stream.runCollect(scanVideoFilesStream(fs, path));

  return Array.from(files).toSorted((left, right) => left.name.localeCompare(right.name));
});

export function scanVideoFilesStream(
  fs: FileSystemShape,
  path: string,
): Stream.Stream<ScannedVideoFile, FileSystemError> {
  return Stream.unfoldChunkEffect({ stack: [path], visited: new Set<string>() }, (state) =>
    Effect.gen(function* () {
      const current = state.stack.pop();

      if (current === undefined) {
        return Option.none();
      }

      const readDirectoryEffect: Effect.Effect<DirEntry[], FileSystemError> = fs.readDirStream
        ? Stream.runCollect(fs.readDirStream(current)).pipe(
            Effect.map((chunk) => Array.from(chunk)),
          )
        : fs.readDir(current);

      const entries = yield* readDirectoryEffect;

      const symlinkEntries: DirEntry[] = [];
      const fileEntries: DirEntry[] = [];
      const dirEntries: DirEntry[] = [];

      for (const entry of entries) {
        if (entry.isSymlink) {
          symlinkEntries.push(entry);
        } else if (entry.isDirectory) {
          dirEntries.push(entry);
        } else if (entry.isFile && isSupportedImportFile(entry.name)) {
          fileEntries.push(entry);
        }
      }

      for (const entry of dirEntries) {
        state.stack.push(`${current.replace(/\/$/, "")}/${entry.name}`);
      }

      const processSymlink = (entry: DirEntry) =>
        Effect.gen(function* () {
          const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;
          const realPath = yield* fs.realPath(fullPath);

          if (state.visited.has(realPath)) {
            return Option.none<ScannedVideoFile>();
          }

          state.visited.add(realPath);

          const realInfo = yield* fs.stat(realPath);

          if (realInfo.isDirectory) {
            state.stack.push(realPath);
            return Option.none<ScannedVideoFile>();
          }

          if (realInfo.isFile && isSupportedImportFile(entry.name)) {
            return Option.some({
              name: entry.name,
              path: fullPath,
              size: realInfo.size,
            } satisfies ScannedVideoFile);
          }

          return Option.none<ScannedVideoFile>();
        });

      const processFile = (entry: DirEntry) =>
        Effect.succeed({
          name: entry.name,
          path: `${current.replace(/\/$/, "")}/${entry.name}`,
          size: entry.size,
        } satisfies ScannedVideoFile);

      const symlinkResults = yield* Effect.forEach(symlinkEntries, processSymlink, {
        concurrency: SCAN_STAT_CONCURRENCY,
      });

      const fileResults = yield* Effect.forEach(fileEntries, processFile, {
        concurrency: SCAN_STAT_CONCURRENCY,
      });

      const files: ScannedVideoFile[] = [
        ...symlinkResults.flatMap((result) => (Option.isSome(result) ? [result.value] : [])),
        ...fileResults,
      ];

      return Option.some([Chunk.fromIterable(files), state] as const);
    }),
  ).pipe(Stream.withSpan("Operations.scanVideoFilesStream"));
}

export function isSupportedImportFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm", ".cbz", ".cbr", ".pdf", ".epub"].some((ext) =>
    name.toLowerCase().endsWith(ext),
  );
}
