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

export const mapBlockStatsToDiskSpaceEffect = Effect.fn("DiskSpace.mapBlockStatsToDiskSpace")(
  function* (stat: BlockStatsShape) {
    const blockSize = toPositiveNumber(stat.bsize, "Invalid block size");
    if (blockSize._tag === "Left") {
      return yield* blockSize.left;
    }
    const availableBlocks = toNonNegativeNumber(stat.bavail, "Invalid available block count");
    if (availableBlocks._tag === "Left") {
      return yield* availableBlocks.left;
    }
    const totalBlocks = toPositiveNumber(stat.blocks, "Invalid total block count");
    if (totalBlocks._tag === "Left") {
      return yield* totalBlocks.left;
    }
    const free = clampDiskBytes(availableBlocks.right * blockSize.right);
    if (free._tag === "Left") {
      return yield* free.left;
    }
    const total = clampDiskBytes(totalBlocks.right * blockSize.right);
    if (total._tag === "Left") {
      return yield* total.left;
    }

    return {
      free: free.right,
      total: total.right,
    };
  },
);

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

    return yield* mapDfOutputToDiskSpaceEffect(path, output).pipe(
      Effect.mapError(toDiskSpaceError(`Failed to parse disk space for ${path}`)),
    );
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
    return {
      _tag: "Left" as const,
      left: new DiskSpaceError({ message: "Invalid disk byte count" }),
    };
  }

  return {
    _tag: "Right" as const,
    right: Math.min(value, Number.MAX_SAFE_INTEGER),
  };
}

const mapDfOutputToDiskSpaceEffect = Effect.fn("DiskSpace.mapDfOutputToDiskSpaceEffect")(function* (
  path: string,
  output: string,
) {
  const result = mapDfOutputToDiskSpaceEither(path, output);

  if (result._tag === "Left") {
    return yield* result.left;
  }

  return result.right;
});

function mapDfOutputToDiskSpaceEither(path: string, output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dataLine = lines.at(-1);

  if (!dataLine) {
    return {
      _tag: "Left" as const,
      left: new DiskSpaceError({ message: `df returned no data for path: ${path}` }),
    };
  }

  const columns = dataLine.split(/\s+/);

  if (columns.length < 4) {
    return {
      _tag: "Left" as const,
      left: new DiskSpaceError({ message: `Unexpected df output for path: ${path}` }),
    };
  }

  const total = Number(columns[1]);
  const available = Number(columns[3]);

  if (!Number.isFinite(total) || total <= 0) {
    return {
      _tag: "Left" as const,
      left: new DiskSpaceError({ message: `Invalid total blocks from df for path: ${path}` }),
    };
  }

  if (!Number.isFinite(available) || available < 0) {
    return {
      _tag: "Left" as const,
      left: new DiskSpaceError({ message: `Invalid available blocks from df for path: ${path}` }),
    };
  }

  const free = clampDiskBytes(available * 1024);
  if (free._tag === "Left") {
    return free;
  }
  const totalBytes = clampDiskBytes(total * 1024);
  if (totalBytes._tag === "Left") {
    return totalBytes;
  }

  return {
    _tag: "Right" as const,
    right: {
      free: free.right,
      total: totalBytes.right,
    },
  };
}

function toPositiveNumber(value: bigint | number, message: string) {
  const numeric = typeof value === "bigint" ? Number(value) : value;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return {
      _tag: "Left" as const,
      left: new DiskSpaceError({ message }),
    };
  }

  return {
    _tag: "Right" as const,
    right: Math.min(numeric, Number.MAX_SAFE_INTEGER),
  };
}

function toNonNegativeNumber(value: bigint | number, message: string) {
  const numeric = typeof value === "bigint" ? Number(value) : value;

  if (!Number.isFinite(numeric) || numeric < 0) {
    return {
      _tag: "Left" as const,
      left: new DiskSpaceError({ message }),
    };
  }

  return {
    _tag: "Right" as const,
    right: Math.min(numeric, Number.MAX_SAFE_INTEGER),
  };
}

function toDiskSpaceError(message: string) {
  return (cause: unknown) =>
    cause instanceof DiskSpaceError ? cause : new DiskSpaceError({ cause, message });
}
