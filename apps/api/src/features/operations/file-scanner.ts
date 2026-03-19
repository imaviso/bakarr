import { Chunk, Effect, Option, Stream } from "effect";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { parseFileSourceIdentity } from "../../lib/media-identity.ts";

export function parseEpisodeNumbers(path: string): readonly number[] {
  const result = parseFileSourceIdentity(path);
  if (!result.source_identity) return [];

  if (result.source_identity.scheme === "daily") {
    return [];
  }

  return result.source_identity.episode_numbers;
}

export function parseEpisodeNumber(path: string): number | undefined {
  return parseEpisodeNumbers(path)[0];
}

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

        const processEntry = (entry: ScannerEntry) =>
          Effect.gen(function* () {
            const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

            if (entry.isSymlink) {
              const realPath = yield* fs.realPath(fullPath).pipe(
                Effect.catchTag("FileSystemError", () => Effect.succeed(null)),
              );

              if (realPath === null || nextVisited.has(realPath)) {
                return;
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
              return;
            }

            if (entry.isDirectory) {
              nextStack.push(fullPath);
              return;
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
          });

        const readDirectory = fs.readDirStream
          ? Stream.runForEach(
            fs.readDirStream(current).pipe(
              Stream.map((entry) => entry as ScannerEntry),
            ),
            processEntry,
          )
          : fs.readDir(current).pipe(
            Effect.flatMap((entries) =>
              Effect.forEach(entries, processEntry, { discard: true })
            ),
          );

        yield* readDirectory.pipe(
          Effect.catchTag(
            "FileSystemError",
            (error) =>
              current === path
                ? Effect.fail(error)
                : isNotFoundError(error)
                ? Effect.void
                : Effect.logWarning(
                  "Skipping inaccessible directory during scan",
                ).pipe(
                  Effect.annotateLogs({ path: current, error: String(error) }),
                ),
          ),
        );

        return Option.some(
          [
            Chunk.fromIterable(files),
            { stack: nextStack, visited: nextVisited },
          ] as const,
        );
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
