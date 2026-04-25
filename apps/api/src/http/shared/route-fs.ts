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
