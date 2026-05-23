import { CommandExecutor } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Stream } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";

export function makeCommandExecutorStub<E extends PlatformError = never>(
  runAsString: (
    command: Parameters<CommandExecutor.CommandExecutor["string"]>[0],
  ) => Effect.Effect<string, E>,
): CommandExecutor.CommandExecutor {
  return {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    exitCode: () => Effect.dieMessage("exitCode not implemented for test"),
    lines: (command, _encoding) =>
      runAsString(command).pipe(
        Effect.map((value) => value.split(/\r?\n/).filter((line) => line.length > 0)),
      ),
    start: () => Effect.dieMessage("start not implemented for test"),
    stream: () => Stream.dieMessage("stream not implemented for test"),
    streamLines: () => Stream.dieMessage("streamLines not implemented for test"),
    string: (command, _encoding) => runAsString(command),
  };
}

export function commandArgs(command: Parameters<CommandExecutor.CommandExecutor["string"]>[0]) {
  if (typeof command === "object" && command !== null && "args" in command) {
    const { args } = command;
    return Array.isArray(args)
      ? args.filter((value): value is string => typeof value === "string")
      : [];
  }

  return [];
}

export function commandName(command: Parameters<CommandExecutor.CommandExecutor["string"]>[0]) {
  if (typeof command === "object" && command !== null && "command" in command) {
    return typeof command.command === "string" ? command.command : undefined;
  }

  return undefined;
}

export function makeRuntimeConfigSnapshotStub(config: Config): RuntimeConfigSnapshotService {
  return RuntimeConfigSnapshotService.make({
    getRuntimeConfig: () => Effect.succeed(config),
    replaceRuntimeConfig: () => Effect.void,
  });
}

export function makeFailingRuntimeConfigSnapshotStub(
  error: RuntimeConfigSnapshotError,
): RuntimeConfigSnapshotService {
  return RuntimeConfigSnapshotService.make({
    getRuntimeConfig: () => Effect.fail(error),
    replaceRuntimeConfig: () => Effect.void,
  });
}
