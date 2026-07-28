import { assert, describe, it } from "@effect/vitest";
import { Config, ConfigProvider, Effect, FileSystem, Layer, PlatformError } from "effect";

const dotEnvAddLayer = ConfigProvider.layerAdd(ConfigProvider.fromDotEnv({ path: ".env" }));

describe("PlatformConfigProvider", () => {
  const ExampleConfig = Config.all({
    value: Config.string("VALUE"),
    number: Config.number("NUMBER"),
  });

  it.effect("loads values from dotenv when current values are missing", () =>
    Effect.gen(function* () {
      const baseProvider = ConfigProvider.layer(ConfigProvider.fromUnknown({}));
      const fileSystem = FileSystem.layerNoop({
        readFileString: () => Effect.succeed("VALUE=hello\nNUMBER=69"),
      });
      const layer = dotEnvAddLayer.pipe(
        Layer.provide(fileSystem),
        Layer.provide(baseProvider),
      );

      const result = yield* ExampleConfig.pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, { number: 69, value: "hello" });
    }),
  );

  it.effect("keeps current config provider precedence over dotenv", () =>
    Effect.gen(function* () {
      const baseProvider = ConfigProvider.layer(ConfigProvider.fromUnknown({ VALUE: "env" }));
      const fileSystem = FileSystem.layerNoop({
        readFileString: () => Effect.succeed("VALUE=dotenv\nNUMBER=69"),
      });
      const layer = dotEnvAddLayer.pipe(
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
        ConfigProvider.fromUnknown({ NUMBER: "71", VALUE: "env" }),
      );
      const fileSystem = FileSystem.layerNoop({
        readFileString: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "NotFound",
              method: "readFileString",
              module: "FileSystem",
              pathOrDescriptor: ".env",
            }),
          ),
      });
      const layer = dotEnvAddLayer.pipe(
        Layer.provide(fileSystem),
        Layer.provide(baseProvider),
      );

      const result = yield* ExampleConfig.pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, { number: 71, value: "env" });
    }),
  );
});
