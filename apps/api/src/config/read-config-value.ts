import { Config as EffectConfig } from "effect";

export function readConfigValue<A>(override: A | undefined, config: EffectConfig.Config<A>) {
  return override === undefined ? config : EffectConfig.succeed(override);
}

export function readNullableConfigValue<A>(
  override: A | null | undefined,
  config: EffectConfig.Config<A>,
  fallback: A | null,
) {
  if (override !== undefined) {
    return EffectConfig.succeed(override);
  }

  return config.pipe(EffectConfig.orElse(() => EffectConfig.succeed(fallback)));
}
