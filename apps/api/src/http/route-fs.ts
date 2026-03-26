import { Effect, Schema } from "effect";
import type { FileSystemShape } from "../lib/filesystem.ts";

const MAX_BROWSE_LIMIT = 500;

export const BrowseEntrySchema = Schema.Struct({
  is_directory: Schema.Boolean,
  name: Schema.String,
  path: Schema.String,
  size: Schema.optional(Schema.Number),
});

export type BrowseEntry = Schema.Schema.Type<typeof BrowseEntrySchema>;

export const BrowseResultSchema = Schema.Struct({
  current_path: Schema.String,
  entries: Schema.Array(BrowseEntrySchema),
  has_more: Schema.Boolean,
  limit: Schema.Number,
  offset: Schema.Number,
  parent_path: Schema.optional(Schema.String),
  total: Schema.Number,
});

export type BrowseResult = Schema.Schema.Type<typeof BrowseResultSchema>;

export function browsePath(
  fs: FileSystemShape,
  path: string,
  options?: { limit?: number; offset?: number },
): Effect.Effect<BrowseResult, never, never> {
  return Effect.gen(function* () {
    const requestedLimit = options?.limit;
    const limit =
      requestedLimit === undefined
        ? undefined
        : Math.min(Math.max(1, requestedLimit), MAX_BROWSE_LIMIT);
    const offset = Math.max(0, options?.offset ?? 0);

    const dirEntries = yield* fs
      .readDir(path)
      .pipe(Effect.catchTag("FileSystemError", () => Effect.succeed([])));

    const normalizedBasePath = path.replace(/\/$/, "");
    const allEntries = dirEntries.map((entry) => {
      const fullPath = `${normalizedBasePath}/${entry.name}`;

      return {
        is_directory: entry.isDirectory,
        name: entry.name,
        path: fullPath,
        size: undefined,
      } satisfies BrowseEntry;
    });

    allEntries.sort(
      (left, right) =>
        Number(right.is_directory) - Number(left.is_directory) ||
        left.name.localeCompare(right.name),
    );

    const total = allEntries.length;
    const paginatedEntriesBase =
      limit === undefined ? allEntries.slice(offset) : allEntries.slice(offset, offset + limit);
    const hasMore = limit === undefined ? false : offset + limit < total;
    const responseLimit = limit ?? paginatedEntriesBase.length;

    const paginatedEntries = yield* Effect.forEach(
      paginatedEntriesBase,
      (entry) =>
        entry.is_directory
          ? Effect.succeed(entry)
          : fs.stat(entry.path).pipe(
              Effect.map((stats) => ({
                ...entry,
                size: stats.isFile ? stats.size : undefined,
              })),
              Effect.catchTag("FileSystemError", () => Effect.succeed(entry)),
            ),
      { concurrency: "unbounded" },
    );

    return {
      current_path: path,
      entries: paginatedEntries,
      has_more: hasMore,
      limit: responseLimit,
      offset,
      parent_path: path === "." ? undefined : path.split("/").slice(0, -1).join("/") || "/",
      total,
    };
  });
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

const contentTypeByExtension = new Map<string, string>([
  [".avi", "video/x-msvideo"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".mkv", "video/x-matroska"],
  [".map", "application/json; charset=utf-8"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
]);

export function contentType(path: string): string {
  const lower = path.toLowerCase();

  for (const [extension, type] of contentTypeByExtension) {
    if (lower.endsWith(extension)) {
      return type;
    }
  }

  return "application/octet-stream";
}
