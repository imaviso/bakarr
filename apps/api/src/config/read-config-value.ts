import { Config } from "effect";

export function configWithDefault<A>(config: Config.Config<A>, fallback: A) {
  return config.pipe(Config.orElse(() => Config.succeed(fallback)));
}

export function readConfigValue<A>(override: A | undefined, config: Config.Config<A>) {
  return override === undefined ? config : Config.succeed(override);
}

export function readConfigValueWithDefault<A>(
  override: A | undefined,
  config: Config.Config<A>,
  fallback: A,
) {
  return readConfigValue(override, configWithDefault(config, fallback));
}

export function readNullableConfigValue<A>(
  override: A | null | undefined,
  config: Config.Config<A>,
  fallback: A | null,
) {
  if (override !== undefined) {
    return Config.succeed(override);
  }

  return configWithDefault(config, fallback);
}
