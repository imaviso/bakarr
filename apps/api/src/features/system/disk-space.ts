import { Command, CommandExecutor } from "@effect/platform";

import { Effect, Option } from "effect";

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

export interface BlockStatsShape {
  readonly bavail: bigint | number;
  readonly blocks: bigint | number;
  readonly bsize: bigint | number;
}

export function mapBlockStatsToDiskSpace(stat: BlockStatsShape): DiskSpace {
  const blockSize = toSafeNumber(stat.bsize);
  const availableBlocks = toSafeNumber(stat.bavail);
  const totalBlocks = toSafeNumber(stat.blocks);

  return {
    free: clampDiskBytes(availableBlocks * blockSize),
    total: clampDiskBytes(totalBlocks * blockSize),
  };
}

export const getDiskSpace = Effect.fn("System.getDiskSpace")(
  (path: string): Effect.Effect<DiskSpace, DiskSpaceError, never> =>
    Effect.gen(function* () {
      const executorOption = yield* Effect.serviceOption(
        CommandExecutor.CommandExecutor,
      );

      if (Option.isNone(executorOption)) {
        return yield* Effect.fail(
          DiskSpaceError(
            `Failed to get disk space for ${path}: command executor unavailable`,
          ),
        );
      }

      const output = yield* Command.make("df", "-Pk", path).pipe(
        Command.string,
        Effect.mapError((cause) =>
          DiskSpaceError(`Failed to get disk space for ${path}`, cause)
        ),
        Effect.provideService(
          CommandExecutor.CommandExecutor,
          executorOption.value,
        ),
      );

      return yield* Effect.try({
        try: () => mapDfOutputToDiskSpace(path, output),
        catch: (cause) =>
          DiskSpaceError(`Failed to parse disk space for ${path}`, cause),
      });
    }),
);

export const getDiskSpaceSafe = Effect.fn("System.getDiskSpaceSafe")(
  (path: string): Effect.Effect<DiskSpace, never, never> => {
    return getDiskSpace(path).pipe(
      Effect.tapError((error) =>
        Effect.logError("Failed to inspect storage volume; using fallback")
          .pipe(
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
  },
);

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

function mapDfOutputToDiskSpace(path: string, output: string): DiskSpace {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(
    Boolean,
  );
  const dataLine = lines.at(-1);

  if (!dataLine) {
    throw new Error(`df returned no data for path: ${path}`);
  }

  const columns = dataLine.split(/\s+/);

  if (columns.length < 4) {
    throw new Error(`Unexpected df output for path: ${path}`);
  }

  const total = Number(columns[1]);
  const available = Number(columns[3]);

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`Invalid total blocks from df for path: ${path}`);
  }

  if (!Number.isFinite(available) || available < 0) {
    throw new Error(`Invalid available blocks from df for path: ${path}`);
  }

  return {
    free: clampDiskBytes(available * 1024),
    total: clampDiskBytes(total * 1024),
  };
}

function toSafeNumber(value: bigint | number) {
  const numeric = typeof value === "bigint" ? Number(value) : value;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.min(numeric, Number.MAX_SAFE_INTEGER);
}
