import { Layer } from "effect";

import { BackgroundWorkerControllerLive } from "@/background-controller-core.ts";
import { BackgroundTaskRunnerLive } from "@/background-task-runner.ts";
import { provideLayer } from "@/lib/layer-compose.ts";

interface BackgroundAppLayerInput<DSOut, DSE, DSR, RSOut, RSE, RSR> {
  readonly appDomainSubgraphLayer: Layer.Layer<DSOut, DSE, DSR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}

export function makeBackgroundAppLayers<DSOut, DSE, DSR, RSOut, RSE, RSR>(
  input: BackgroundAppLayerInput<DSOut, DSE, DSR, RSOut, RSE, RSR>,
) {
  const { appDomainSubgraphLayer, runtimeSupportLayer } = input;
  const backgroundTaskRunnerLayer = provideLayer(
    BackgroundTaskRunnerLive,
    Layer.mergeAll(appDomainSubgraphLayer, runtimeSupportLayer),
  );
  const backgroundControllerLayer = provideLayer(
    BackgroundWorkerControllerLive,
    Layer.mergeAll(backgroundTaskRunnerLayer, runtimeSupportLayer),
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
