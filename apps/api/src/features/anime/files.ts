import type { VideoFile } from "../../../../../packages/shared/src/index.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import { Effect } from "effect";
import { parseEpisodeNumber } from "../../lib/episode-parser.ts";

export { parseEpisodeNumber };

export const collectVideoFiles = Effect.fn("AnimeService.collectVideoFiles")(
  function* (
    fs: FileSystemShape,
    rootFolder: string,
  ) {
    const entries: VideoFile[] = [];
    const stack = [rootFolder];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      const dirEntries = yield* fs.readDir(current).pipe(
        Effect.catchAll(() => Effect.succeed<Deno.DirEntry[]>([])),
      );

      for (const entry of dirEntries) {
        const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

        if (entry.isDirectory) {
          stack.push(fullPath);
          continue;
        }

        if (!entry.isFile || !isVideoFile(entry.name)) {
          continue;
        }

        const stats = yield* fs.stat(fullPath).pipe(
          Effect.catchAll(() =>
            Effect.succeed({ size: 0 } as { size: number })
          ),
        );
        entries.push({
          episode_number: parseEpisodeNumber(fullPath),
          name: entry.name,
          path: fullPath,
          size: stats.size,
        });
      }
    }

    return entries.sort((left, right) => left.name.localeCompare(right.name));
  },
);

function isVideoFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm"].some((extension) =>
    name.toLowerCase().endsWith(extension)
  );
}
