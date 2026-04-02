import { assert, it } from "@effect/vitest";
import * as PlatformError from "@effect/platform/Error";
import { Cause, Effect, Exit } from "effect";

import { makeTestConfig } from "@/test/config-fixture.ts";
import { commandName, makeCommandExecutorStub } from "@/test/stubs.ts";
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
  try {
    mapBlockStatsToDiskSpace({
      bavail: -1n,
      blocks: 100n,
      bsize: 4096n,
    });
    assert.fail("Expected DiskSpaceError");
  } catch (error) {
    assert.deepStrictEqual(error instanceof DiskSpaceError, true);
    if (error instanceof DiskSpaceError) {
      assert.deepStrictEqual(error.message, "Invalid available block count");
    }
  }
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
    const commandExecutorStub = makeCommandExecutorStub(() =>
      Effect.fail(
        new PlatformError.SystemError({
          cause: new Error("df failed"),
          description: "df failed",
          method: "string",
          module: "Command",
          reason: "Unknown",
        }),
      ),
    );

    const result = yield* Effect.exit(
      makeDiskSpaceInspector(commandExecutorStub).getDiskSpaceSafe("/tmp"),
    );

    assert.deepStrictEqual(Exit.isFailure(result), true);
    if (Exit.isFailure(result)) {
      const failure = Cause.failureOption(result.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value instanceof DiskSpaceError, true);
        assert.match(failure.value.message, /failed to get disk space/i);
      }
    }
  }),
);

it.effect("getDiskSpaceSafe returns real values for valid path", () =>
  Effect.gen(function* () {
    const commandExecutorStub = makeCommandExecutorStub((command) => {
      const name = commandName(command);

      if (name !== "df") {
        return Effect.die(new Error(`unexpected command: ${name ?? "unknown"}`));
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
