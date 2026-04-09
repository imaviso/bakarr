import { Layer } from "effect";

import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search-missing-support.ts";
import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search-queue-service.ts";
import { BackgroundSearchRssFeedServiceLive } from "@/features/operations/background-search-rss-feed-service.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search-rss-support.ts";
import { BackgroundSearchRssWorkerServiceLive } from "@/features/operations/background-search-rss-worker-service.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search-orchestration-release-search.ts";
import { type AnyLayer, provideFrom, provideLayer } from "@/lib/layer-compose.ts";

interface OperationsSearchLayerInput {
  readonly downloadRuntimeLayer: AnyLayer;
  readonly operationsProgressLayer: AnyLayer;
  readonly runtimeSupportLayer: AnyLayer;
}

export function makeOperationsSearchLayer(input: OperationsSearchLayerInput) {
  const { downloadRuntimeLayer, operationsProgressLayer, runtimeSupportLayer } = input;
  const withRuntime = provideFrom(runtimeSupportLayer);
  const runtimeWithProgressLayer = Layer.mergeAll(runtimeSupportLayer, operationsProgressLayer);

  const buildSearchCoreLayers = () => {
    const backgroundSearchQueueLayer = provideLayer(
      BackgroundSearchQueueServiceLive,
      downloadRuntimeLayer,
    );
    const runtimeWithQueueLayer = Layer.mergeAll(runtimeSupportLayer, backgroundSearchQueueLayer);
    const backgroundSearchRssFeedLayer = provideLayer(
      BackgroundSearchRssFeedServiceLive,
      runtimeWithQueueLayer,
    );
    const searchReleaseLayer = withRuntime(SearchReleaseServiceLive);

    const runtimeWithReleaseLayer = Layer.mergeAll(runtimeSupportLayer, searchReleaseLayer);
    const searchEpisodeLayer = provideLayer(SearchEpisodeServiceLive, runtimeWithReleaseLayer);

    return {
      backgroundSearchQueueLayer,
      backgroundSearchRssFeedLayer,
      searchEpisodeLayer,
      searchReleaseLayer,
    } as const;
  };

  const coreLayers = buildSearchCoreLayers();

  const buildSearchOrchestrationLayers = () => {
    const missingSearchDependenciesLayer = Layer.mergeAll(
      runtimeWithProgressLayer,
      coreLayers.backgroundSearchQueueLayer,
      coreLayers.searchReleaseLayer,
    );
    const searchBackgroundMissingLayer = provideLayer(
      SearchBackgroundMissingServiceLive,
      missingSearchDependenciesLayer,
    );

    const rssSearchDependenciesLayer = Layer.mergeAll(
      runtimeWithProgressLayer,
      coreLayers.backgroundSearchRssFeedLayer,
      coreLayers.backgroundSearchQueueLayer,
    );
    const searchBackgroundRssLayer = provideLayer(
      SearchBackgroundRssServiceLive,
      rssSearchDependenciesLayer,
    );

    const rssWorkerDependenciesLayer = Layer.mergeAll(
      runtimeWithProgressLayer,
      searchBackgroundRssLayer,
      searchBackgroundMissingLayer,
    );
    const backgroundSearchRssWorkerLayer = provideLayer(
      BackgroundSearchRssWorkerServiceLive,
      rssWorkerDependenciesLayer,
    );

    return {
      backgroundSearchRssWorkerLayer,
      searchBackgroundMissingLayer,
      searchBackgroundRssLayer,
    } as const;
  };

  const orchestrationLayers = buildSearchOrchestrationLayers();

  const searchSubgraphLayer = Layer.mergeAll(
    coreLayers.backgroundSearchQueueLayer,
    coreLayers.backgroundSearchRssFeedLayer,
    coreLayers.searchReleaseLayer,
    coreLayers.searchEpisodeLayer,
    orchestrationLayers.searchBackgroundMissingLayer,
    orchestrationLayers.searchBackgroundRssLayer,
    orchestrationLayers.backgroundSearchRssWorkerLayer,
  );

  return {
    searchSubgraphLayer,
  } as const;
}
