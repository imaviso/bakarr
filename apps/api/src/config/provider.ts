import { ConfigProvider, Effect } from "effect";

/**
 * Dotenv config provider that treats a missing `.env` file as empty config.
 * A single-user local deployment should not require a dotenv file to boot.
 */
export const dotEnvProvider = (options: { readonly path?: string } = {}) =>
  ConfigProvider.fromDotEnv({ path: options.path ?? ".env" }).pipe(
    Effect.catch((error) =>
      error.reason._tag === "NotFound"
        ? Effect.succeed(ConfigProvider.fromUnknown({}))
        : Effect.fail(error),
    ),
  );

export const dotEnvAddLayer = ConfigProvider.layerAdd(dotEnvProvider());
