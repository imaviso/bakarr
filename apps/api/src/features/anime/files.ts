import type { VideoFile } from "../../../../../packages/shared/src/index.ts";

export async function collectVideoFiles(rootFolder: string): Promise<VideoFile[]> {
  const entries: VideoFile[] = [];
  const stack = [rootFolder];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    try {
      for await (const entry of Deno.readDir(current)) {
        const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

        if (entry.isDirectory) {
          stack.push(fullPath);
          continue;
        }

        if (!entry.isFile || !isVideoFile(entry.name)) {
          continue;
        }

        const stats = await Deno.stat(fullPath);
        entries.push({
          episode_number: parseEpisodeNumber(fullPath),
          name: entry.name,
          path: fullPath,
          size: stats.size,
        });
      }
    } catch {
      // Ignore inaccessible directories.
    }
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

export function parseEpisodeNumber(path: string) {
  const filename = path.split("/").pop() ?? path;
  const match = filename.match(/(?:^|[^0-9])(\d{1,3})(?:[^0-9]|$)/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function isVideoFile(name: string) {
  return [".mkv", ".mp4", ".avi", ".mov", ".webm"].some((extension) =>
    name.toLowerCase().endsWith(extension)
  );
}
