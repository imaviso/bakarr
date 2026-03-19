import { Effect } from "effect";
import type { FileSystemShape } from "../lib/filesystem.ts";

const DEFAULT_BROWSE_LIMIT = 100;
const MAX_BROWSE_LIMIT = 500;

interface BrowseEntry {
  is_directory: boolean;
  name: string;
  path: string;
  size?: number;
}

interface BrowseResult {
  current_path: string;
  entries: BrowseEntry[];
  has_more: boolean;
  limit: number;
  offset: number;
  parent_path?: string;
  total: number;
}

export function browsePath(
  fs: FileSystemShape,
  path: string,
  options?: { limit?: number; offset?: number },
): Effect.Effect<BrowseResult, never, never> {
  return Effect.gen(function* () {
    const requestedLimit = options?.limit ?? DEFAULT_BROWSE_LIMIT;
    const limit = Math.min(Math.max(1, requestedLimit), MAX_BROWSE_LIMIT);
    const offset = Math.max(0, options?.offset ?? 0);

    const allEntries: BrowseEntry[] = [];

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
      allEntries.push({
        is_directory: entry.isDirectory,
        name: entry.name,
        path: fullPath,
        size: stats.isFile ? stats.size : undefined,
      });
    }

    allEntries.sort((left, right) =>
      Number(right.is_directory) - Number(left.is_directory) ||
      left.name.localeCompare(right.name)
    );

    const total = allEntries.length;
    const paginatedEntries = allEntries.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      current_path: path,
      entries: paginatedEntries,
      has_more: hasMore,
      limit,
      offset,
      parent_path: path === "."
        ? undefined
        : path.split("/").slice(0, -1).join("/") || "/",
      total,
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
