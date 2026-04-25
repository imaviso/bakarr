import { Layer } from "effect";

import { BackgroundWorkerControllerLive } from "@/background/controller-core.ts";
import { BackgroundTaskRunnerLive } from "@/background/task-runner.ts";

interface BackgroundAppLayerInput<DSOut, DSE, DSR, RSOut, RSE, RSR> {
  readonly appDomainSubgraphLayer: Layer.Layer<DSOut, DSE, DSR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}

export function makeBackgroundAppLayers<DSOut, DSE, DSR, RSOut, RSE, RSR>(
  input: BackgroundAppLayerInput<DSOut, DSE, DSR, RSOut, RSE, RSR>,
) {
  const { appDomainSubgraphLayer, runtimeSupportLayer } = input;
  const backgroundTaskRunnerLayer = BackgroundTaskRunnerLive.pipe(
    Layer.provide(Layer.mergeAll(appDomainSubgraphLayer, runtimeSupportLayer)),
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provide(Layer.mergeAll(backgroundTaskRunnerLayer, runtimeSupportLayer)),
  );

  return {
    backgroundControllerLayer,
    backgroundTaskRunnerLayer,
    runtimeWorkerSubgraphLayer: Layer.mergeAll(
      backgroundTaskRunnerLayer,
      backgroundControllerLayer,
    ),
  } as const;
}
