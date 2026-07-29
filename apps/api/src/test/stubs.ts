import type { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process";
import type { PlatformError } from "effect/PlatformError";
import { Effect, Stream } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotServiceShape,
} from "@/features/system/runtime-config-snapshot-service.ts";

export function makeCommandExecutorStub<E extends PlatformError = never>(
  runAsString: (command: ChildProcess.Command) => Effect.Effect<string, E>,
): ChildProcessSpawner.ChildProcessSpawner["Service"] {
  return {
    exitCode: () => Effect.die(new Error("exitCode not implemented for test")),
    lines: (command) =>
      runAsString(command).pipe(
        Effect.map((value) => value.split(/\r?\n/).filter((line) => line.length > 0)),
      ),
    spawn: () => Effect.die(new Error("spawn not implemented for test")),
    streamString: () => Stream.die(new Error("streamString not implemented for test")),
    streamLines: () => Stream.die(new Error("streamLines not implemented for test")),
    string: (command) => runAsString(command),
  };
}

export function commandArgs(command: ChildProcess.Command) {
  return command._tag === "StandardCommand" ? [...command.args] : [];
}

export function commandName(command: ChildProcess.Command) {
  return command._tag === "StandardCommand" ? command.command : undefined;
}

export function makeRuntimeConfigSnapshotStub(config: Config): RuntimeConfigSnapshotServiceShape {
  return RuntimeConfigSnapshotService.of({
    getRuntimeConfig: () => Effect.succeed(config),
    replaceRuntimeConfig: () => Effect.void,
  });
}

export function makeFailingRuntimeConfigSnapshotStub(
  error: RuntimeConfigSnapshotError,
): RuntimeConfigSnapshotServiceShape {
  return RuntimeConfigSnapshotService.of({
    getRuntimeConfig: () => Effect.fail(error),
    replaceRuntimeConfig: () => Effect.void,
  });
}
