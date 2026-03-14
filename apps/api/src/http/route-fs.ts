import { Effect } from "effect";
import type { FileSystemShape } from "../lib/filesystem.ts";

export function browsePath(fs: FileSystemShape, path: string) {
  return Effect.gen(function* () {
    const entries: Array<
      { is_directory: boolean; name: string; path: string; size?: number }
    > = [];

    const dirEntries = yield* fs.readDir(path).pipe(
      Effect.catchTag(
        "FileSystemError",
        () => Effect.succeed<Deno.DirEntry[]>([]),
      ),
    );

    for (const entry of dirEntries) {
      const fullPath = `${path.replace(/\/$/, "")}/${entry.name}`;
      const stats = yield* fs.stat(fullPath).pipe(
        Effect.catchTag("FileSystemError", () =>
          Effect.succeed(
            {
              isFile: false,
              isDirectory: entry.isDirectory,
            } as unknown as Deno.FileInfo,
          )),
      );
      entries.push({
        is_directory: entry.isDirectory,
        name: entry.name,
        path: fullPath,
        size: stats.isFile ? stats.size : undefined,
      });
    }

    entries.sort((left, right) =>
      Number(right.is_directory) - Number(left.is_directory) ||
      left.name.localeCompare(right.name)
    );

    return {
      current_path: path,
      entries,
      parent_path: path === "."
        ? undefined
        : path.split("/").slice(0, -1).join("/") || "/",
    };
  });
}

export function guessContentType(name: string) {
  const lower = name.toLowerCase();

  if (lower.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (lower.endsWith(".webm")) {
    return "video/webm";
  }

  if (lower.endsWith(".mov")) {
    return "video/quicktime";
  }

  if (lower.endsWith(".avi")) {
    return "video/x-msvideo";
  }

  return "video/x-matroska";
}

export function escapeCsv(value: string) {
  const escaped = value.replaceAll('"', '""');
  if (
    escaped.startsWith("=") ||
    escaped.startsWith("+") ||
    escaped.startsWith("-") ||
    escaped.startsWith("@")
  ) {
    return `"'${escaped}"`;
  }
  return `"${escaped}"`;
}
