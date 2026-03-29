import { Chunk, Effect, Option, Stream } from "effect";
import { FileSystemError, type FileSystemShape } from "@/lib/filesystem.ts";

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

  return Array.from(files).sort((left, right) => left.name.localeCompare(right.name));
});

interface ScannerEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly isSymlink: boolean;
}

export function scanVideoFilesStream(
  fs: FileSystemShape,
  path: string,
): Stream.Stream<ScannedVideoFile, FileSystemError> {
  return Stream.unfoldChunkEffect({ stack: [path], visited: new Set<string>() }, (state) =>
    Effect.gen(function* () {
      if (state.stack.length === 0) {
        return Option.none();
      }

      const nextStack = [...state.stack];
      const current = nextStack.pop();

      if (!current) {
        return Option.none();
      }

      const nextVisited = new Set(state.visited);

      const readDirectoryEffect: Effect.Effect<ScannerEntry[], FileSystemError, never> =
        fs.readDirStream
          ? Stream.runCollect(
              fs.readDirStream(current).pipe(Stream.map((entry) => entry as ScannerEntry)),
            ).pipe(Effect.map((chunk) => Array.from(chunk)))
          : fs.readDir(current);

      const entries = yield* readDirectoryEffect;

      const symlinkEntries: ScannerEntry[] = [];
      const fileEntries: ScannerEntry[] = [];
      const dirEntries: ScannerEntry[] = [];

      for (const entry of entries) {
        if (entry.isSymlink) {
          symlinkEntries.push(entry);
        } else if (entry.isDirectory) {
          dirEntries.push(entry);
        } else if (entry.isFile && isVideoFile(entry.name)) {
          fileEntries.push(entry);
        }
      }

      for (const entry of dirEntries) {
        const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;
        nextStack.push(fullPath);
      }

      const processSymlink = (entry: ScannerEntry) =>
        Effect.gen(function* () {
          const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;
          const realPath = yield* fs.realPath(fullPath);

          if (nextVisited.has(realPath)) {
            return null;
          }

          nextVisited.add(realPath);

          const realInfo = yield* fs.stat(fullPath);

          if (realInfo.isDirectory) {
            nextStack.push(fullPath);
            return null;
          }

          if (realInfo.isFile && isVideoFile(entry.name)) {
            return {
              name: entry.name,
              path: fullPath,
              size: realInfo.size,
            } satisfies ScannedVideoFile;
          }

          return null;
        });

      const processFile = (entry: ScannerEntry) =>
        Effect.gen(function* () {
          const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;
          const stats = yield* fs.stat(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            size: stats.size,
          } satisfies ScannedVideoFile;
        });

      const symlinkResults = yield* Effect.forEach(symlinkEntries, processSymlink, {
        concurrency: SCAN_STAT_CONCURRENCY,
      });

      const fileResults = yield* Effect.forEach(fileEntries, processFile, {
        concurrency: SCAN_STAT_CONCURRENCY,
      });

      const files: ScannedVideoFile[] = [
        ...symlinkResults.filter((r): r is ScannedVideoFile => r !== null),
        ...fileResults,
      ];

      return Option.some([
        Chunk.fromIterable(files),
        { stack: nextStack, visited: nextVisited },
      ] as const);
    }),
  ).pipe(Stream.withSpan("Operations.scanVideoFilesStream"));
}

function isVideoFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm"].some((ext) => name.toLowerCase().endsWith(ext));
}
