import { Effect } from "effect";
import type { FileSystemShape } from "../../lib/filesystem.ts";

export function scanVideoFiles(fs: FileSystemShape, path: string) {
  return Effect.fn("Operations.scanVideoFiles")(function* () {
    const results: { name: string; path: string }[] = [];
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
  })();
}

export function parseEpisodeNumber(path: string) {
  const filename = path.split("/").pop() ?? path;
  const match = filename.match(/(?:^|[^0-9])(\d{1,3})(?:[^0-9]|$)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function isVideoFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm"].some((ext) =>
    name.toLowerCase().endsWith(ext)
  );
}
