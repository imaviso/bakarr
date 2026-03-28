import { Layer } from "effect";

import { makeAppPlatformRuntimeLayer, type RuntimeOptions } from "./app-platform-runtime-layer.ts";
import { makeBackgroundRuntimeLayer } from "./background-runtime-layer.ts";
import { makeAnimeRuntimeLayer } from "./features/anime/anime-runtime-layer.ts";
import { makeAuthRuntimeLayer } from "./features/auth/auth-runtime-layer.ts";
import { makeOperationsRuntimeLayer } from "./features/operations/operations-runtime-layer.ts";
import { makeAppServicesRuntimeLayer } from "./app-services-runtime-layer.ts";
import { makeSystemRuntimeLayers } from "./features/system/system-runtime-layer.ts";
import type { AppConfigShape } from "./config.ts";

export function makeApiLifecycleLayers(
  overrides: Partial<AppConfigShape> = {},
  options?: RuntimeOptions,
) {
  const platformLayer = makeAppPlatformRuntimeLayer(overrides, options);
  const operationsLayer = makeOperationsRuntimeLayer(platformLayer);
  const animeLayer = makeAnimeRuntimeLayer(platformLayer);
  const backgroundLayer = makeBackgroundRuntimeLayer(platformLayer, operationsLayer, animeLayer);
  const authLayer = makeAuthRuntimeLayer(platformLayer);
  const { systemConfigLayer, systemLayer, systemStatusLayer } = makeSystemRuntimeLayers(
    platformLayer,
    backgroundLayer,
  );
  const appServicesLayer = makeAppServicesRuntimeLayer(
    platformLayer,
    operationsLayer,
    systemConfigLayer,
    systemStatusLayer,
    animeLayer,
  );
  const httpLayer = Layer.mergeAll(authLayer, systemLayer, appServicesLayer);

  return {
    appServicesLayer,
    animeLayer,
    authLayer,
    backgroundLayer,
    httpLayer,
    operationsLayer,
    platformLayer,
    systemConfigLayer,
    systemLayer,
    systemStatusLayer,
  } as const;
}

export type ApiLifecycleLayers = ReturnType<typeof makeApiLifecycleLayers>;
