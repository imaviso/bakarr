import type { VideoFile } from "../../../../../packages/shared/src/index.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import { Effect } from "effect";
import {
  classifyMediaArtifact,
  parseFileSourceIdentity,
} from "../../lib/media-identity.ts";

function parseEpisodeNumber(path: string): number | undefined {
  const parsed = parseFileSourceIdentity(path);
  const identity = parsed.source_identity;
  if (!identity || identity.scheme === "daily") return undefined;
  return identity.episode_numbers[0];
}

export { parseEpisodeNumber };

export const collectVideoFiles = Effect.fn("AnimeService.collectVideoFiles")(
  function* (
    fs: FileSystemShape,
    rootFolder: string,
  ) {
    const entries: VideoFile[] = [];
    const stack = [rootFolder];
    let isRoot = true;

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      const isCurrentRoot = isRoot;
      isRoot = false;

      const dirEntries = yield* fs.readDir(current).pipe(
        Effect.catchTag(
          "FileSystemError",
          (error) =>
            !isCurrentRoot && isNotFoundError(error)
              ? Effect.succeed<Deno.DirEntry[]>([])
              : Effect.fail(error),
        ),
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

        const classification = classifyMediaArtifact(fullPath, entry.name);
        if (
          classification.kind === "extra" || classification.kind === "sample"
        ) {
          continue;
        }

        const stats = yield* fs.stat(fullPath).pipe(
          Effect.catchTag(
            "FileSystemError",
            (error) =>
              isNotFoundError(error)
                ? Effect.succeed({ size: 0 } as { size: number })
                : Effect.fail(error),
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

function isNotFoundError(error: { cause?: unknown }): boolean {
  const cause = error.cause;
  if (cause instanceof Error && "code" in cause) {
    return (cause as { code?: string }).code === "ENOENT" ||
      (cause as { code?: string }).code === "NotFound";
  }
  return false;
}
