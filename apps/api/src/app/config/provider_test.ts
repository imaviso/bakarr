import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { assert, describe, it } from "@effect/vitest";
import { Config, ConfigProvider, Effect, Layer } from "effect";

describe("ConfigProvider dotenv", () => {
  const ExampleConfig = Config.all({
    value: Config.string("VALUE"),
    number: Config.number("NUMBER"),
  });

  it.effect("loads values from dotenv when current values are missing", () =>
    Effect.gen(function* () {
      const baseProvider = ConfigProvider.layer(ConfigProvider.fromEnvRecord({}));
      const fileSystem = FileSystem.layerNoop({
        readFileString: (_path) => Effect.succeed("VALUE=hello\nNUMBER=69"),
      });
      const layer = ConfigProvider.layerAdd(ConfigProvider.fromDotEnv({ path: ".env" })).pipe(
        Layer.provide(fileSystem),
        Layer.provide(baseProvider),
      );

      const result = yield* ExampleConfig.pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, { number: 69, value: "hello" });
    }),
  );

  it.effect("keeps current config provider precedence over dotenv", () =>
    Effect.gen(function* () {
      const baseProvider = ConfigProvider.layer(ConfigProvider.fromEnvRecord({ VALUE: "env" }));
      const fileSystem = FileSystem.layerNoop({
        readFileString: (_path) => Effect.succeed("VALUE=dotenv\nNUMBER=69"),
      });
      const layer = ConfigProvider.layerAdd(ConfigProvider.fromDotEnv({ path: ".env" })).pipe(
        Layer.provide(fileSystem),
        Layer.provide(baseProvider),
      );

      const result = yield* ExampleConfig.pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, { number: 69, value: "env" });
    }),
  );

  it.effect("ignores missing dotenv files", () =>
    Effect.gen(function* () {
      const baseProvider = ConfigProvider.layer(
        ConfigProvider.fromEnvRecord({ VALUE: "env", NUMBER: "71" }),
      );
      const fileSystem = FileSystem.layerNoop({
        readFileString: (_path) =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "NotFound",
              method: "readFileString",
              module: "FileSystem",
              pathOrDescriptor: ".env",
            }),
          ),
      });
      // v4 fromDotEnv fails at construction when the file is missing; callers
      // catch and fall back to the base provider (same as runtime-core).
      const layer = ConfigProvider.layerAdd(
        ConfigProvider.fromDotEnv({ path: ".env" }).pipe(
          Effect.catch(() => Effect.succeed(ConfigProvider.fromEnvRecord({}))),
        ),
      ).pipe(Layer.provide(fileSystem), Layer.provide(baseProvider));

      const result = yield* ExampleConfig.pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, { number: 71, value: "env" });
    }),
  );
});
