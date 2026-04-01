import { Layer } from "effect";

import { BackgroundWorkerControllerLive } from "@/background-controller-live.ts";
import { BackgroundWorkerJobsLive } from "@/background-worker-jobs.ts";
import { makeAppPlatformCoreRuntimeLayer } from "@/app-platform-runtime-core.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { MediaProbeLive } from "@/lib/media-probe.ts";
import { AnimeFeatureLive } from "@/features/anime/anime-feature-layer.ts";
import { AnimeEnrollmentServiceLive } from "@/features/anime/anime-enrollment-service.ts";
import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library-browse-service.ts";
import { OperationsFeatureLive } from "@/features/operations/operations-feature-layer.ts";
import { SystemFeatureLive } from "@/features/system/system-feature-layer.ts";
import type { AppConfigShape } from "@/config.ts";
import type { AppPlatformRuntimeOptions } from "@/app-platform-runtime-core.ts";

export function makeApiLifecycleLayers(
  overrides: Partial<AppConfigShape> = {},
  options?: AppPlatformRuntimeOptions,
) {
  const platformBaseLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const commandLayer = options?.commandExecutorLayer;
  const platformWithCommandLayer = commandLayer
    ? Layer.mergeAll(platformBaseLayer, commandLayer)
    : platformBaseLayer;
  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provideMerge(platformWithCommandLayer),
  );
  const platformLayer = Layer.mergeAll(platformWithCommandLayer, infrastructureLayer);

  const animeLayer = AnimeFeatureLive.pipe(Layer.provideMerge(platformLayer));
  const operationsLayer = OperationsFeatureLive.pipe(Layer.provideMerge(platformLayer));

  const backgroundWorkerJobsLayer = BackgroundWorkerJobsLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, backgroundWorkerJobsLayer)),
  );
  const systemLayer = SystemFeatureLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, backgroundControllerLayer)),
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
