import { Layer } from "effect";

import { BackgroundWorkerControllerLive } from "@/background-controller-core.ts";
import { BackgroundTaskRunnerLive } from "@/background-task-runner.ts";
import {
  makeAppExternalClientLayer,
  type AppExternalClientLayerOptions,
} from "@/app-platform-external-clients-layer.ts";
import {
  makeAppPlatformCoreRuntimeLayer,
  type AppPlatformRuntimeOptions,
} from "@/app-platform-runtime-core.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { MediaProbeLive } from "@/lib/media-probe.ts";
import { AnimeFeatureLive } from "@/features/anime/anime-feature-layer.ts";
import { AnimeEnrollmentServiceLive } from "@/features/anime/anime-enrollment-service.ts";
import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library-browse-service.ts";
import { OperationsFeatureLive } from "@/features/operations/operations-feature-layer.ts";
import {
  SystemFeatureLive,
  SystemRuntimeCoreLive,
} from "@/features/system/system-feature-layer.ts";
import type { AppConfigShape } from "@/config.ts";
export type ApiLifecycleOptions = AppPlatformRuntimeOptions & AppExternalClientLayerOptions;

export function makeApiLifecycleLayers(
  overrides: Partial<AppConfigShape> = {},
  options?: ApiLifecycleOptions,
) {
  const platformBaseLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const externalClientLayer = makeAppExternalClientLayer({
    aniListLayer: options?.aniListLayer,
    qbitLayer: options?.qbitLayer,
    rssLayer: options?.rssLayer,
    seadexLayer: options?.seadexLayer,
  }).pipe(Layer.provideMerge(platformBaseLayer));
  const commandLayer = options?.commandExecutorLayer;
  const platformWithCommandLayer = commandLayer
    ? Layer.mergeAll(platformBaseLayer, commandLayer, externalClientLayer)
    : Layer.mergeAll(platformBaseLayer, externalClientLayer);
  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provideMerge(platformWithCommandLayer),
  );
  const platformLayer = Layer.mergeAll(platformWithCommandLayer, infrastructureLayer);

  const systemRuntimeLayer = SystemRuntimeCoreLive.pipe(Layer.provideMerge(platformLayer));

  const animeLayer = AnimeFeatureLive.pipe(Layer.provideMerge(platformLayer));
  const operationsLayer = OperationsFeatureLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, systemRuntimeLayer)),
  );

  const backgroundTaskRunnerLayer = BackgroundTaskRunnerLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, backgroundTaskRunnerLayer)),
  );
  const systemLayer = SystemFeatureLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(platformLayer, backgroundControllerLayer, systemRuntimeLayer),
    ),
  );
  const authLayer = Layer.mergeAll(
    AuthBootstrapServiceLive,
    AuthCredentialServiceLive,
    AuthSessionServiceLive,
  ).pipe(Layer.provideMerge(platformLayer));
  const libraryLayer = LibraryBrowseServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, systemLayer)),
  );
  const animeEnrollmentLayer = AnimeEnrollmentServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );

  const appLayer = Layer.mergeAll(
    operationsLayer,
    animeLayer,
    backgroundTaskRunnerLayer,
    backgroundControllerLayer,
    authLayer,
    systemLayer,
    libraryLayer,
    animeEnrollmentLayer,
  );

  return {
    appLayer,
    platformLayer,
  } as const;
}

export type ApiLifecycleLayers = ReturnType<typeof makeApiLifecycleLayers>;
