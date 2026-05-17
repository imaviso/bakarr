import { assert, it } from "@effect/vitest";
import * as PlatformError from "@effect/platform/Error";
import { Cause, Effect, Exit } from "effect";

import { makeTestConfig } from "@/test/config-fixture.ts";
import { commandArgs, commandName, makeCommandExecutorStub } from "@/test/stubs.ts";
import {
  DiskSpaceError,
  makeDiskSpaceInspector,
  mapBlockStatsToDiskSpaceEffect,
  selectStoragePath,
} from "@/features/system/disk-space.ts";

const baseConfig = makeTestConfig("./test.sqlite");

it.effect("mapBlockStatsToDiskSpace converts block stats to bytes", () =>
  Effect.gen(function* () {
    const result = yield* mapBlockStatsToDiskSpaceEffect({
      bavail: 25n,
      blocks: 100n,
      bsize: 4096n,
    });

    assert.deepStrictEqual(result, { free: 102400, total: 409600 });
  }),
);

it.effect("mapBlockStatsToDiskSpace fails with a typed error for invalid stats", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      mapBlockStatsToDiskSpaceEffect({
        bavail: -1n,
        blocks: 100n,
        bsize: 4096n,
      }),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value instanceof DiskSpaceError, true);
        assert.deepStrictEqual(failure.value.message, "Invalid available block count");
      }
    }
  }),
);

it("selectStoragePath prefers anime_path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, anime_path: "/library/anime" },
    downloads: { ...baseConfig.downloads, root_path: "/downloads" },
    general: { ...baseConfig.general, database_path: "/db/test.sqlite" },
  };
  assert.deepStrictEqual(selectStoragePath(config, "/runtime/test.sqlite"), "/library/anime");
});

it("selectStoragePath falls back to downloads root_path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, anime_path: "", manga_path: "", light_novel_path: "" },
    downloads: { ...baseConfig.downloads, root_path: "/downloads" },
    general: { ...baseConfig.general, database_path: "/db/test.sqlite" },
  };
  assert.deepStrictEqual(selectStoragePath(config, "/runtime/test.sqlite"), "/downloads");
});

it("selectStoragePath falls back to runtime database path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, anime_path: "", manga_path: "", light_novel_path: "" },
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

it.effect("getDiskSpaceSafe falls back to an existing parent path", () =>
  Effect.gen(function* () {
    let observedPath: string | undefined;
    const commandExecutorStub = makeCommandExecutorStub((command) => {
      const name = commandName(command);
      const args = commandArgs(command);

      if (name !== "df") {
        return Effect.die(new Error(`unexpected command: ${name ?? "unknown"}`));
      }

      observedPath = args[1];
      return Effect.succeed(
        "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 1000 250 750 25% /tmp",
      );
    });

    const missingPath = "/tmp/bakarr-disk-space-missing/probe";
    const result = yield* makeDiskSpaceInspector(commandExecutorStub).getDiskSpaceSafe(missingPath);

    assert.deepStrictEqual(result.free, 768000);
    assert.deepStrictEqual(result.total, 1024000);
    assert.deepStrictEqual(observedPath, "/tmp");
  }),
);
