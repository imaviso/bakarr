import { statfs } from "node:fs/promises";

import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";

export interface DiskSpace {
  readonly free: number;
  readonly total: number;
}

export interface DiskSpaceError {
  readonly _tag: "DiskSpaceError";
  readonly message: string;
  readonly cause?: unknown;
}

export const DiskSpaceError = (
  message: string,
  cause?: unknown,
): DiskSpaceError => ({
  _tag: "DiskSpaceError",
  cause,
  message,
});

export interface StatFsShape {
  readonly bavail: bigint | number;
  readonly blocks: bigint | number;
  readonly bsize: bigint | number;
}

export function mapStatFsToDiskSpace(stat: StatFsShape): DiskSpace {
  const blockSize = toSafeNumber(stat.bsize);
  const availableBlocks = toSafeNumber(stat.bavail);
  const totalBlocks = toSafeNumber(stat.blocks);

  return {
    free: clampDiskBytes(availableBlocks * blockSize),
    total: clampDiskBytes(totalBlocks * blockSize),
  };
}

export function getDiskSpace(
  path: string,
): Effect.Effect<DiskSpace, DiskSpaceError, never> {
  return Effect.tryPromise({
    catch: (cause) =>
      DiskSpaceError(`Failed to get disk space for ${path}`, cause),
    try: async () => mapStatFsToDiskSpace(await statfs(path, { bigint: true })),
  });
}

export function getDiskSpaceSafe(
  path: string,
): Effect.Effect<DiskSpace, never, never> {
  return getDiskSpace(path).pipe(
    Effect.tapError((error) =>
      Effect.logError("Failed to inspect storage volume; using fallback").pipe(
        Effect.annotateLogs({
          component: "system",
          diskPath: path,
          error: error.message,
          fallback_free: 0,
          fallback_total: 0,
        }),
      )
    ),
    Effect.catchAll(() => Effect.succeed({ free: 0, total: 0 })),
  );
}

export function selectStoragePath(
  config: Config,
  databaseFile: string,
): string {
  const libraryPath = config.library.library_path.trim();
  if (libraryPath) {
    return libraryPath;
  }
  const downloadsPath = config.downloads.root_path.trim();
  if (downloadsPath) {
    return downloadsPath;
  }
  return databaseFile;
}

function clampDiskBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(value, Number.MAX_SAFE_INTEGER);
}

function toSafeNumber(value: bigint | number) {
  const numeric = typeof value === "bigint" ? Number(value) : value;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.min(numeric, Number.MAX_SAFE_INTEGER);
}
