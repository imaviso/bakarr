export async function scanVideoFiles(path: string) {
  const files: Array<{ name: string; path: string }> = [];
  const stack = [path];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    for await (const entry of Deno.readDir(current)) {
      const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

      if (entry.isDirectory) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile && isVideoFile(entry.name)) {
        files.push({ name: entry.name, path: fullPath });
      }
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
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
