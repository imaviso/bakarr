const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const SPEED_UNITS = ["B/s", "KB/s", "MB/s", "GB/s"] as const;

export function clampConfidencePercent(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

/**
 * Format a byte count with binary units (e.g. "1.5 MB").
 * Preserves the `system-status` behavior: 2 decimals, "0 B" for zero.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), BYTE_UNITS.length - 1);
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${BYTE_UNITS[i]}`;
}

/**
 * Format a transfer rate with binary units (e.g. "1.5 MB/s").
 * Preserves the `download-rows` behavior: 1 decimal, "0 B/s" for zero.
 */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) {
    return "0 B/s";
  }

  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(k)), SPEED_UNITS.length - 1);
  return `${parseFloat((bytesPerSec / k ** i).toFixed(1))} ${SPEED_UNITS[i]}`;
}

/**
 * Format an ETA in seconds as compact "d h" / "h m" / "m" / "s".
 * Preserves the `download-rows` behavior: `8640000` → "∞", non-positive → "Done".
 */
export function formatEta(seconds: number): string {
  if (seconds === 8640000) return "∞";
  if (seconds <= 0) return "Done";

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * Format a duration in seconds as "1h 5m" / "1m 5s" / "45s".
 * Preserves the `scanned-file` `formatDurationSeconds` behavior (test-pinned).
 */
export function formatDurationSeconds(value?: number | null): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Format a byte count as MB/GB only (1 decimal), `undefined` for missing/zero.
 * Preserves the `scanned-file` `formatFileSize` behavior (MB/GB-only display for
 * import/scan file sizes; a byte count below 1 MB renders as "0.0 MB").
 */
export function formatFileSize(size?: number): string | undefined {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return undefined;
  }

  if (size >= 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
