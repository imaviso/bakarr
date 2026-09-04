import { Effect, Predicate, Stream } from "effect";
import * as CommandExecutor from "effect/unstable/process/ChildProcessSpawner";
import type * as PlatformError from "effect/PlatformError";

import type { Config } from "@packages/shared/index.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";

export function makeCommandExecutorStub<E extends PlatformError.PlatformError = never>(
  runAsString: (
    command: Parameters<CommandExecutor.ChildProcessSpawner["Service"]["string"]>[0],
  ) => Effect.Effect<string, E>,
): CommandExecutor.ChildProcessSpawner["Service"] {
  return {
    exitCode: () => Effect.die(new Error("exitCode not implemented for test")),
    lines: (command) =>
      runAsString(command).pipe(
        Effect.map((value) => value.split(/\r?\n/).filter((line) => line.length > 0)),
      ),
    spawn: () => Effect.die(new Error("spawn not implemented for test")),
    streamLines: () => Stream.die(new Error("streamLines not implemented for test")),
    streamString: () => Stream.die(new Error("streamString not implemented for test")),
    string: (command) => runAsString(command),
  };
}

export function commandArgs(
  command: Parameters<CommandExecutor.ChildProcessSpawner["Service"]["string"]>[0],
) {
  if (Predicate.hasProperty(command, "args")) {
    const { args } = command;
    return Array.isArray(args)
      ? args.filter((value): value is string => typeof value === "string")
      : [];
  }

  return [];
}

export function commandName(
  command: Parameters<CommandExecutor.ChildProcessSpawner["Service"]["string"]>[0],
) {
  if (Predicate.hasProperty(command, "command")) {
    return typeof command.command === "string" ? command.command : undefined;
  }

  return undefined;
}

export function makeRuntimeConfigSnapshotStub(
  config: Config,
): typeof RuntimeConfigSnapshotService.Service {
  return RuntimeConfigSnapshotService.of({
    getRuntimeConfig: () => Effect.succeed(config),
    replaceRuntimeConfig: () => Effect.void,
  });
}

export function makeFailingRuntimeConfigSnapshotStub(
  error: RuntimeConfigSnapshotError,
): typeof RuntimeConfigSnapshotService.Service {
  return RuntimeConfigSnapshotService.of({
    getRuntimeConfig: () => Effect.fail(error),
    replaceRuntimeConfig: () => Effect.void,
  });
}
