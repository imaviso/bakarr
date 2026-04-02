import { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";

import type { AppDatabase, DatabaseService } from "@/db/database.ts";

export function makeDatabaseServiceStub(db: AppDatabase): DatabaseService {
  return {
    get client(): never {
      throw new Error("test database stub should not access sqlite client");
    },
    db,
  };
}

export function makeCommandExecutorStub(
  runAsString: (
    command: Parameters<CommandExecutor.CommandExecutor["string"]>[0],
  ) => Effect.Effect<string, never>,
): CommandExecutor.CommandExecutor {
  return {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    exitCode: () => {
      throw new Error("exitCode not implemented for test");
    },
    lines: (command, _encoding) =>
      runAsString(command).pipe(
        Effect.map((value) => value.split(/\r?\n/).filter((line) => line.length > 0)),
      ),
    start: () => {
      throw new Error("start not implemented for test");
    },
    stream: () => {
      throw new Error("stream not implemented for test");
    },
    streamLines: () => {
      throw new Error("streamLines not implemented for test");
    },
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
