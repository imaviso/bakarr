import type { VideoFile } from "@packages/shared/index.ts";
import type { DirEntry, FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import { Effect } from "effect";
import { classifyMediaArtifact, parseFileSourceIdentity } from "@/infra/media/identity/identity.ts";

function parseEpisodeNumber(path: string): number | undefined {
  const parsed = parseFileSourceIdentity(path);
  const identity = parsed.source_identity;
  if (!identity || identity.scheme === "daily") return undefined;
  return identity.unit_numbers[0];
}

export { parseEpisodeNumber };

export const collectVideoFiles = Effect.fn("AnimeService.collectVideoFiles")(function* (
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

    const dirEntries = yield* fs
      .readDir(current)
      .pipe(
        Effect.catchTag("FileSystemError", (error) =>
          !isCurrentRoot && isNotFoundError(error)
            ? Effect.succeed<DirEntry[]>([])
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
      if (classification.kind === "extra" || classification.kind === "sample") {
        continue;
      }

      entries.push({
        unit_number: parseEpisodeNumber(fullPath),
        name: entry.name,
        path: fullPath,
        size: entry.size,
      });
    }
  }

  return entries.toSorted((left, right) => left.name.localeCompare(right.name));
});

function isVideoFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm"].some((extension) =>
    name.toLowerCase().endsWith(extension),
  );
}
