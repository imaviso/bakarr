import { Layer } from "effect";

import {
  makeAppPlatformCoreRuntimeLayer,
  type AppPlatformRuntimeOptions,
} from "./app-platform-runtime-core.ts";
import { makeAppPlatformCommandExecutorLayer } from "./app-platform-runtime-command.ts";
import type { AppConfigShape } from "./config.ts";

export type RuntimeOptions = AppPlatformRuntimeOptions;

export function makeAppPlatformRuntimeLayer(
  overrides: Partial<AppConfigShape> = {},
  options?: RuntimeOptions,
) {
  const platformBaseLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformBaseLayer, options.commandExecutorLayer)
    : platformBaseLayer;
  const commandExecutorLayer = makeAppPlatformCommandExecutorLayer(platformLayer);

  return Layer.mergeAll(platformLayer, commandExecutorLayer);
}
