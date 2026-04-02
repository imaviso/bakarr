import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { CommandExecutor } from "@effect/platform";
import { Effect, Exit } from "effect";

import { makeTestConfig } from "@/test/config-fixture.ts";
import {
  DiskSpaceError,
  makeDiskSpaceInspector,
  mapBlockStatsToDiskSpace,
  selectStoragePath,
} from "@/features/system/disk-space.ts";

const baseConfig = makeTestConfig("./test.sqlite");

it("mapBlockStatsToDiskSpace converts block stats to bytes", () => {
  const result = mapBlockStatsToDiskSpace({
    bavail: 25n,
    blocks: 100n,
    bsize: 4096n,
  });

  assert.deepStrictEqual(result, { free: 102400, total: 409600 });
});

it("mapBlockStatsToDiskSpace throws a typed error for invalid stats", () => {
  assert.throws(
    () =>
      mapBlockStatsToDiskSpace({
        bavail: -1n,
        blocks: 100n,
        bsize: 4096n,
      }),
    (error) => error instanceof DiskSpaceError && error.message === "Invalid available block count",
  );
});

it("selectStoragePath prefers library_path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "/library" },
    downloads: { ...baseConfig.downloads, root_path: "/downloads" },
    general: { ...baseConfig.general, database_path: "/db/test.sqlite" },
  };
  assert.deepStrictEqual(selectStoragePath(config, "/runtime/test.sqlite"), "/library");
});

it("selectStoragePath falls back to downloads root_path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "" },
    downloads: { ...baseConfig.downloads, root_path: "/downloads" },
    general: { ...baseConfig.general, database_path: "/db/test.sqlite" },
  };
  assert.deepStrictEqual(selectStoragePath(config, "/runtime/test.sqlite"), "/downloads");
});

it("selectStoragePath falls back to runtime database path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "" },
    downloads: { ...baseConfig.downloads, root_path: "" },
    general: { ...baseConfig.general, database_path: "/db/config.sqlite" },
  };

  assert.deepStrictEqual(selectStoragePath(config, "/runtime/test.sqlite"), "/runtime/test.sqlite");
});

it.effect("getDiskSpaceSafe fails when df fails", () =>
  Effect.gen(function* () {
    const commandExecutorStub = makeCommandExecutorStub(() => Effect.die(new Error("df failed")));

    const result = yield* Effect.exit(
      makeDiskSpaceInspector(commandExecutorStub).getDiskSpaceSafe("/tmp"),
    );

    assert.deepStrictEqual(Exit.isFailure(result), true);
  }),
);

it.effect("getDiskSpaceSafe returns real values for valid path", () =>
  Effect.gen(function* () {
    const commandExecutorStub = makeCommandExecutorStub((command) => {
      if (command.command !== "df") {
        return Effect.die(new Error(`unexpected command: ${command.command}`));
      }

      return Effect.succeed(
        "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 1000 250 750 25% /tmp",
      );
    });

    const result = yield* makeDiskSpaceInspector(commandExecutorStub).getDiskSpaceSafe("/tmp");

    assert.deepStrictEqual(typeof result.free, "number");
    assert.deepStrictEqual(typeof result.total, "number");
    assert.deepStrictEqual(result.free, 768000);
    assert.deepStrictEqual(result.total, 1024000);
  }),
);

function makeCommandExecutorStub(
  runAsString: (command: {
    readonly args: ReadonlyArray<string>;
    readonly command: string;
  }) => Effect.Effect<string, never>,
): CommandExecutor.CommandExecutor {
  return {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    exitCode: () => Effect.die("exitCode not implemented for test"),
    lines: (command, _encoding) =>
      runAsString(command as { args: ReadonlyArray<string>; command: string }).pipe(
        Effect.map((value) => value.split(/\r?\n/).filter((line) => line.length > 0)),
      ),
    start: () => Effect.die("start not implemented for test"),
    stream: () => Effect.die("stream not implemented for test"),
    streamLines: () => Effect.die("streamLines not implemented for test"),
    string: (command, _encoding) =>
      runAsString(command as { args: ReadonlyArray<string>; command: string }),
  };
}
