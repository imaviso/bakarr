import { Chunk, Effect, Option, Stream } from "effect";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import { parseEpisodeNumber } from "../../lib/episode-parser.ts";

export { parseEpisodeNumber };

export interface ScannedVideoFile {
  readonly name: string;
  readonly path: string;
}

export const scanVideoFiles = Effect.fn("Operations.scanVideoFiles")(
  function* (fs: FileSystemShape, path: string) {
    const files = yield* Stream.runCollect(scanVideoFilesStream(fs, path));

    return Array.from(files);
  },
);

export function scanVideoFilesStream(
  fs: FileSystemShape,
  path: string,
): Stream.Stream<ScannedVideoFile> {
  return Stream.unfoldChunkEffect([path], (stack) =>
    Effect.gen(function* () {
      if (stack.length === 0) {
        return Option.none();
      }

      const nextStack = [...stack];
      const current = nextStack.pop();

      if (!current) {
        return Option.none();
      }

      const entries = yield* fs.readDir(current).pipe(
        Effect.catchAll(() => Effect.succeed<Deno.DirEntry[]>([])),
      );
      const files: ScannedVideoFile[] = [];

      for (const entry of entries) {
        const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

        if (entry.isDirectory) {
          nextStack.push(fullPath);
          continue;
        }

        if (entry.isFile && isVideoFile(entry.name)) {
          files.push({ name: entry.name, path: fullPath });
        }
      }

      return Option.some([
        Chunk.fromIterable(files),
        nextStack,
      ] as const);
    })
  ).pipe(Stream.withSpan("Operations.scanVideoFilesStream"));
}

function isVideoFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm"].some((ext) =>
    name.toLowerCase().endsWith(ext)
  );
}
