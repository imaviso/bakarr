import { Layer } from "effect";

import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search-missing-support.ts";
import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search-queue-service.ts";
import { BackgroundSearchRssFeedServiceLive } from "@/features/operations/background-search-rss-feed-service.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search-rss-support.ts";
import { BackgroundSearchRssWorkerServiceLive } from "@/features/operations/background-search-rss-worker-service.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search-orchestration-release-search.ts";

interface OperationsSearchLayerInput<DRTOut, DRTE, DRTR, OPOut, OPE, OPR, RSOut, RSE, RSR> {
  readonly downloadRuntimeLayer: Layer.Layer<DRTOut, DRTE, DRTR>;
  readonly operationsProgressLayer: Layer.Layer<OPOut, OPE, OPR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}

export function makeOperationsSearchLayer<DRTOut, DRTE, DRTR, OPOut, OPE, OPR, RSOut, RSE, RSR>(
  input: OperationsSearchLayerInput<DRTOut, DRTE, DRTR, OPOut, OPE, OPR, RSOut, RSE, RSR>,
) {
  const { downloadRuntimeLayer, operationsProgressLayer, runtimeSupportLayer } = input;
  const runtimeWithProgressLayer = Layer.mergeAll(runtimeSupportLayer, operationsProgressLayer);

  const backgroundSearchQueueLayer = BackgroundSearchQueueServiceLive.pipe(
    Layer.provide(downloadRuntimeLayer),
  );
  const runtimeWithQueueLayer = Layer.mergeAll(runtimeSupportLayer, backgroundSearchQueueLayer);
  const backgroundSearchRssFeedLayer = BackgroundSearchRssFeedServiceLive.pipe(
    Layer.provide(runtimeWithQueueLayer),
  );
  const searchReleaseLayer = SearchReleaseServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const runtimeWithReleaseLayer = Layer.mergeAll(runtimeSupportLayer, searchReleaseLayer);
  const searchEpisodeLayer = SearchEpisodeServiceLive.pipe(Layer.provide(runtimeWithReleaseLayer));

  const missingSearchDependenciesLayer = Layer.mergeAll(
    runtimeWithProgressLayer,
    backgroundSearchQueueLayer,
    searchReleaseLayer,
  );
  const searchBackgroundMissingLayer = SearchBackgroundMissingServiceLive.pipe(
    Layer.provide(missingSearchDependenciesLayer),
  );

  const rssSearchDependenciesLayer = Layer.mergeAll(
    runtimeWithProgressLayer,
    backgroundSearchRssFeedLayer,
    backgroundSearchQueueLayer,
  );
  const searchBackgroundRssLayer = SearchBackgroundRssServiceLive.pipe(
    Layer.provide(rssSearchDependenciesLayer),
  );

  const rssWorkerDependenciesLayer = Layer.mergeAll(
    runtimeWithProgressLayer,
    searchBackgroundRssLayer,
    searchBackgroundMissingLayer,
  );
  const backgroundSearchRssWorkerLayer = BackgroundSearchRssWorkerServiceLive.pipe(
    Layer.provide(rssWorkerDependenciesLayer),
  );

  const searchSubgraphLayer = Layer.mergeAll(
    backgroundSearchQueueLayer,
    backgroundSearchRssFeedLayer,
    searchReleaseLayer,
    searchEpisodeLayer,
    searchBackgroundMissingLayer,
    searchBackgroundRssLayer,
    backgroundSearchRssWorkerLayer,
  );

  return {
    searchSubgraphLayer,
  } as const;
}
