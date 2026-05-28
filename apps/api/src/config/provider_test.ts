import { Error as PlatformError, FileSystem, PlatformConfigProvider } from "@effect/platform";
import { assert, describe, it } from "@effect/vitest";
import { Config, ConfigProvider, Effect, Layer } from "effect";

describe("PlatformConfigProvider", () => {
  const ExampleConfig = Config.all({
    value: Config.string("VALUE"),
    number: Config.number("NUMBER"),
  });

  it.effect("loads values from dotenv when current values are missing", () =>
    Effect.gen(function* () {
      const baseProvider = Layer.setConfigProvider(ConfigProvider.fromMap(new Map()));
      const fileSystem = FileSystem.layerNoop({
        readFileString: () => Effect.succeed("VALUE=hello\nNUMBER=69"),
      });
      const layer = PlatformConfigProvider.layerDotEnvAdd(".env").pipe(
        Layer.provide(fileSystem),
        Layer.provide(baseProvider),
      );

      const result = yield* ExampleConfig.pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, { number: 69, value: "hello" });
    }),
  );

  it.effect("keeps current config provider precedence over dotenv", () =>
    Effect.gen(function* () {
      const baseProvider = Layer.setConfigProvider(
        ConfigProvider.fromMap(new Map([["VALUE", "env"]])),
      );
      const fileSystem = FileSystem.layerNoop({
        readFileString: () => Effect.succeed("VALUE=dotenv\nNUMBER=69"),
      });
      const layer = PlatformConfigProvider.layerDotEnvAdd(".env").pipe(
        Layer.provide(fileSystem),
        Layer.provide(baseProvider),
      );

      const result = yield* ExampleConfig.pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, { number: 69, value: "env" });
    }),
  );

  it.effect("ignores missing dotenv files", () =>
    Effect.gen(function* () {
      const baseProvider = Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["VALUE", "env"],
            ["NUMBER", "71"],
          ]),
        ),
      );
      const fileSystem = FileSystem.layerNoop({
        readFileString: () =>
          Effect.fail(
            new PlatformError.SystemError({
              method: "readFileString",
              module: "FileSystem",
              pathOrDescriptor: ".env",
              reason: "NotFound",
            }),
          ),
      });
      const layer = PlatformConfigProvider.layerDotEnvAdd(".env").pipe(
        Layer.provide(fileSystem),
        Layer.provide(baseProvider),
      );

      const result = yield* ExampleConfig.pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, { number: 71, value: "env" });
    }),
  );
});
