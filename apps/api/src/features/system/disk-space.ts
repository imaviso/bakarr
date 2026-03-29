import { Command, CommandExecutor } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";

import type { Config } from "@packages/shared/index.ts";

export const DiskSpaceSchema = Schema.Struct({
  free: Schema.Number,
  total: Schema.Number,
});

export type DiskSpace = Schema.Schema.Type<typeof DiskSpaceSchema>;

export class DiskSpaceError extends Schema.TaggedError<DiskSpaceError>()("DiskSpaceError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export const BlockStatsSchema = Schema.Struct({
  bavail: Schema.Union(Schema.Number, Schema.BigInt),
  blocks: Schema.Union(Schema.Number, Schema.BigInt),
  bsize: Schema.Union(Schema.Number, Schema.BigInt),
});

export type BlockStatsShape = Schema.Schema.Type<typeof BlockStatsSchema>;

export interface DiskSpaceInspectorShape {
  readonly getDiskSpace: (path: string) => Effect.Effect<DiskSpace, DiskSpaceError>;
  readonly getDiskSpaceSafe: (path: string) => Effect.Effect<DiskSpace, DiskSpaceError>;
}

export class DiskSpaceInspector extends Context.Tag("@bakarr/api/DiskSpaceInspector")<
  DiskSpaceInspector,
  DiskSpaceInspectorShape
>() {}

export function mapBlockStatsToDiskSpace(stat: BlockStatsShape): DiskSpace {
  const blockSize = toPositiveNumber(stat.bsize, "Invalid block size");
  const availableBlocks = toNonNegativeNumber(stat.bavail, "Invalid available block count");
  const totalBlocks = toPositiveNumber(stat.blocks, "Invalid total block count");

  return {
    free: clampDiskBytes(availableBlocks * blockSize),
    total: clampDiskBytes(totalBlocks * blockSize),
  };
}

function runDfCommand(commandExecutor: CommandExecutor.CommandExecutor, path: string) {
  return Command.make("df", "-Pk", path).pipe(
    Command.string,
    Effect.mapError(toDiskSpaceError(`Failed to get disk space for ${path}`)),
    Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor),
  );
}

export function makeDiskSpaceInspector(
  commandExecutor: CommandExecutor.CommandExecutor,
): DiskSpaceInspectorShape {
  const getDiskSpace = Effect.fn("DiskSpaceInspector.getDiskSpace")(function* (path: string) {
    const output = yield* runDfCommand(commandExecutor, path);

    return yield* Effect.try({
      try: () => mapDfOutputToDiskSpace(path, output),
      catch: toDiskSpaceError(`Failed to parse disk space for ${path}`),
    });
  });

  const getDiskSpaceSafe = Effect.fn("DiskSpaceInspector.getDiskSpaceSafe")(
    (path: string): Effect.Effect<DiskSpace, DiskSpaceError, never> =>
      getDiskSpace(path).pipe(
        Effect.tapError((error) =>
          Effect.logError("Failed to inspect storage volume").pipe(
            Effect.annotateLogs({
              component: "system",
              diskPath: path,
              error: error.message,
            }),
          ),
        ),
      ),
  );

  return {
    getDiskSpace,
    getDiskSpaceSafe,
  };
}

export const DiskSpaceInspectorLive = Layer.effect(
  DiskSpaceInspector,
  Effect.gen(function* () {
    const commandExecutor = yield* CommandExecutor.CommandExecutor;
    return makeDiskSpaceInspector(commandExecutor);
  }),
);

export function selectStoragePath(config: Config, databaseFile: string): string {
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
  if (!Number.isFinite(value) || value < 0) {
    throw new DiskSpaceError({ message: "Invalid disk byte count" });
  }

  return Math.min(value, Number.MAX_SAFE_INTEGER);
}

function mapDfOutputToDiskSpace(path: string, output: string): DiskSpace {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dataLine = lines.at(-1);

  if (!dataLine) {
    throw new DiskSpaceError({ message: `df returned no data for path: ${path}` });
  }

  const columns = dataLine.split(/\s+/);

  if (columns.length < 4) {
    throw new DiskSpaceError({ message: `Unexpected df output for path: ${path}` });
  }

  const total = Number(columns[1]);
  const available = Number(columns[3]);

  if (!Number.isFinite(total) || total <= 0) {
    throw new DiskSpaceError({ message: `Invalid total blocks from df for path: ${path}` });
  }

  if (!Number.isFinite(available) || available < 0) {
    throw new DiskSpaceError({ message: `Invalid available blocks from df for path: ${path}` });
  }

  return {
    free: clampDiskBytes(available * 1024),
    total: clampDiskBytes(total * 1024),
  };
}

function toPositiveNumber(value: bigint | number, message: string) {
  const numeric = typeof value === "bigint" ? Number(value) : value;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new DiskSpaceError({ message });
  }

  return Math.min(numeric, Number.MAX_SAFE_INTEGER);
}

function toNonNegativeNumber(value: bigint | number, message: string) {
  const numeric = typeof value === "bigint" ? Number(value) : value;

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new DiskSpaceError({ message });
  }

  return Math.min(numeric, Number.MAX_SAFE_INTEGER);
}

function toDiskSpaceError(message: string) {
  return (cause: unknown) =>
    cause instanceof DiskSpaceError ? cause : new DiskSpaceError({ cause, message });
}
