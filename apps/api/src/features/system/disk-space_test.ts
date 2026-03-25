import { assertEquals, it } from "../../test/vitest.ts";
import { CommandExecutor } from "@effect/platform";
import { Effect, Exit, Layer } from "effect";

import { makeDefaultConfig } from "./defaults.ts";
import {
  getDiskSpaceSafe,
  mapBlockStatsToDiskSpace,
  selectStoragePath,
} from "./disk-space.ts";

const baseConfig = { ...makeDefaultConfig("./test.sqlite"), profiles: [] };

it("mapBlockStatsToDiskSpace converts block stats to bytes", () => {
  const result = mapBlockStatsToDiskSpace({
    bavail: 25n,
    blocks: 100n,
    bsize: 4096n,
  });

  assertEquals(result, { free: 102400, total: 409600 });
});

it("selectStoragePath prefers library_path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "/library" },
    downloads: { ...baseConfig.downloads, root_path: "/downloads" },
    general: { ...baseConfig.general, database_path: "/db/test.sqlite" },
  };
  assertEquals(selectStoragePath(config, "/runtime/test.sqlite"), "/library");
});

it("selectStoragePath falls back to downloads root_path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "" },
    downloads: { ...baseConfig.downloads, root_path: "/downloads" },
    general: { ...baseConfig.general, database_path: "/db/test.sqlite" },
  };
  assertEquals(selectStoragePath(config, "/runtime/test.sqlite"), "/downloads");
});

it("selectStoragePath falls back to runtime database path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "" },
    downloads: { ...baseConfig.downloads, root_path: "" },
    general: { ...baseConfig.general, database_path: "/db/config.sqlite" },
  };

  assertEquals(
    selectStoragePath(config, "/runtime/test.sqlite"),
    "/runtime/test.sqlite",
  );
});

it.effect("getDiskSpaceSafe fails on error instead of fabricating zeros", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      getDiskSpaceSafe("/nonexistent/path/that/does/not/exist"),
    );
    assertEquals(Exit.isFailure(result), true);
  })
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

    const result = yield* getDiskSpaceSafe("/tmp").pipe(
      Effect.provide(
        Layer.succeed(CommandExecutor.CommandExecutor, commandExecutorStub),
      ),
    );

    assertEquals(typeof result.free, "number");
    assertEquals(typeof result.total, "number");
    assertEquals(result.free, 768000);
    assertEquals(result.total, 1024000);
  })
);

function makeCommandExecutorStub(
  runAsString: (
    command: {
      readonly args: ReadonlyArray<string>;
      readonly command: string;
    },
  ) => Effect.Effect<string, never>,
): CommandExecutor.CommandExecutor {
  return {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    exitCode: () => Effect.die("exitCode not implemented for test"),
    lines: (command, _encoding) =>
      runAsString(command as { args: ReadonlyArray<string>; command: string })
        .pipe(
          Effect.map((value) =>
            value.split(/\r?\n/).filter((line) => line.length > 0)
          ),
        ),
    start: () => Effect.die("start not implemented for test"),
    stream: () => Effect.die("stream not implemented for test") as never,
    streamLines: () =>
      Effect.die("streamLines not implemented for test") as never,
    string: (command, _encoding) =>
      runAsString(command as { args: ReadonlyArray<string>; command: string }),
  };
}
