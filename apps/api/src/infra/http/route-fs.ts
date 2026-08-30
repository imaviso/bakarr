export function escapeCsv(value: string) {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(guarded)) {
    return `"${guarded.replaceAll('"', '""')}"`;
  }
  return guarded;
}

export function inlineContentDisposition(fileName: string) {
  const asciiOnly = fileName.replace(/[^\x20-\x7E]/g, "_");
  const sanitized = asciiOnly.replace(/[\r\n]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
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
