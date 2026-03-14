import { Effect } from "effect";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import { parseEpisodeNumber } from "../../lib/episode-parser.ts";

export { parseEpisodeNumber };

export interface ScannedVideoFile {
  readonly name: string;
  readonly path: string;
}

export const scanVideoFiles = Effect.fn("Operations.scanVideoFiles")(
  function* (fs: FileSystemShape, path: string) {
    const results: ScannedVideoFile[] = [];
    const stack = [path];

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
        continue;
      }

      const entries = yield* fs.readDir(current).pipe(
        Effect.catchAll(() => Effect.succeed<Deno.DirEntry[]>([])),
      );

      for (const entry of entries) {
        const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

        if (entry.isDirectory) {
          stack.push(fullPath);
          continue;
        }

        if (entry.isFile && isVideoFile(entry.name)) {
          results.push({ name: entry.name, path: fullPath });
        }
      }
    }

    return results;
  },
);

export async function* scanVideoFilesIterator(
  fs: FileSystemShape,
  path: string,
): AsyncGenerator<ScannedVideoFile, void, unknown> {
  const stack = [path];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    const entries = await Effect.runPromise(
      fs.readDir(current).pipe(
        Effect.catchAll(() => Effect.succeed<Deno.DirEntry[]>([])),
      ),
    );

    for (const entry of entries) {
      const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

      if (entry.isDirectory) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile && isVideoFile(entry.name)) {
        yield { name: entry.name, path: fullPath };
      }
    }
  }
}

function isVideoFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm"].some((ext) =>
    name.toLowerCase().endsWith(ext)
  );
}
