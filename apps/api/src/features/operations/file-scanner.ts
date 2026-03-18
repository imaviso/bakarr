import { Chunk, Effect, Option, Stream } from "effect";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import {
  parseEpisodeNumber,
  parseEpisodeNumbers,
} from "../../lib/episode-parser.ts";

export { parseEpisodeNumber };
export { parseEpisodeNumbers };

export interface ScannedVideoFile {
  readonly name: string;
  readonly path: string;
  readonly size: number;
}

export const scanVideoFiles = Effect.fn("Operations.scanVideoFiles")(
  function* (fs: FileSystemShape, path: string) {
    const files = yield* Stream.runCollect(scanVideoFilesStream(fs, path));

    return Array.from(files).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  },
);

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
  return Stream.unfoldChunkEffect(
    { stack: [path], visited: new Set<string>() },
    (state) =>
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
        const files: ScannedVideoFile[] = [];

        const entries = yield* fs.readDir(current).pipe(
          Effect.catchTag(
            "FileSystemError",
            (error) =>
              current === path
                ? Effect.fail(error)
                : isNotFoundError(error)
                ? Effect.succeed<ScannerEntry[]>([])
                : Effect.logWarning(
                  "Skipping inaccessible directory during scan",
                ).pipe(
                  Effect.annotateLogs({ path: current, error: String(error) }),
                  Effect.map(() => [] as ScannerEntry[]),
                ),
          ),
        );

        for (const entry of entries) {
          const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

          if (entry.isSymlink) {
            const realPath = yield* fs.realPath(fullPath).pipe(
              Effect.catchTag("FileSystemError", () => Effect.succeed(null)),
            );

            if (realPath === null || nextVisited.has(realPath)) {
              continue;
            }

            nextVisited.add(realPath);

            const realInfo = yield* fs.stat(fullPath).pipe(
              Effect.catchTag(
                "FileSystemError",
                () =>
                  Effect.succeed({
                    isDirectory: false,
                    isFile: false,
                    isSymlink: false,
                    size: 0,
                  }),
              ),
            );

            if (realInfo.isDirectory) {
              nextStack.push(fullPath);
            } else if (realInfo.isFile && isVideoFile(entry.name)) {
              files.push({
                name: entry.name,
                path: fullPath,
                size: realInfo.size,
              });
            }
            continue;
          }

          if (entry.isDirectory) {
            nextStack.push(fullPath);
            continue;
          }

          if (entry.isFile && isVideoFile(entry.name)) {
            const stats = yield* fs.stat(fullPath).pipe(
              Effect.catchTag(
                "FileSystemError",
                () =>
                  Effect.succeed({
                    isDirectory: false,
                    isFile: false,
                    isSymlink: false,
                    size: 0,
                  }),
              ),
            );
            files.push({
              name: entry.name,
              path: fullPath,
              size: stats.size,
            });
          }
        }

        return Option.some([
          Chunk.fromIterable(files),
          { stack: nextStack, visited: nextVisited },
        ] as const);
      }),
  ).pipe(Stream.withSpan("Operations.scanVideoFilesStream"));
}

function isVideoFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm"].some((ext) =>
    name.toLowerCase().endsWith(ext)
  );
}

function isNotFoundError(error: { cause?: unknown }): boolean {
  const cause = error.cause;
  if (cause instanceof Error && "code" in cause) {
    return (cause as { code?: string }).code === "ENOENT" ||
      (cause as { code?: string }).code === "NotFound";
  }
  return false;
}
