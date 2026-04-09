import { Layer } from "effect";

import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search-missing-support.ts";
import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search-queue-service.ts";
import { BackgroundSearchRssFeedServiceLive } from "@/features/operations/background-search-rss-feed-service.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search-rss-support.ts";
import { BackgroundSearchRssWorkerServiceLive } from "@/features/operations/background-search-rss-worker-service.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search-orchestration-release-search.ts";

type LayerRef<Out, Err, Req> = Layer.Layer<Out, Err, Req>;

export function makeOperationsSearchLayer<RSOut, RSE, RSR, DOut, DE, DR, POut, PE, PR>(input: {
  readonly downloadRuntimeLayer: LayerRef<DOut, DE, DR>;
  readonly operationsProgressLayer: LayerRef<POut, PE, PR>;
  readonly runtimeSupportLayer: LayerRef<RSOut, RSE, RSR>;
}) {
  const backgroundSearchQueueLayer = BackgroundSearchQueueServiceLive.pipe(
    Layer.provideMerge(input.downloadRuntimeLayer),
  );
  const runtimeWithQueueLayer = Layer.mergeAll(
    input.runtimeSupportLayer,
    backgroundSearchQueueLayer,
  );
  const backgroundSearchRssFeedLayer = BackgroundSearchRssFeedServiceLive.pipe(
    Layer.provideMerge(runtimeWithQueueLayer),
  );
  const searchReleaseLayer = SearchReleaseServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const runtimeWithReleaseLayer = Layer.mergeAll(input.runtimeSupportLayer, searchReleaseLayer);
  const searchEpisodeLayer = SearchEpisodeServiceLive.pipe(
    Layer.provideMerge(runtimeWithReleaseLayer),
  );
  const missingSearchDependenciesLayer = Layer.mergeAll(
    input.runtimeSupportLayer,
    backgroundSearchQueueLayer,
    input.operationsProgressLayer,
    searchReleaseLayer,
  );
  const searchBackgroundMissingLayer = SearchBackgroundMissingServiceLive.pipe(
    Layer.provideMerge(missingSearchDependenciesLayer),
  );
  const rssSearchDependenciesLayer = Layer.mergeAll(
    input.runtimeSupportLayer,
    backgroundSearchRssFeedLayer,
    backgroundSearchQueueLayer,
    input.operationsProgressLayer,
  );
  const searchBackgroundRssLayer = SearchBackgroundRssServiceLive.pipe(
    Layer.provideMerge(rssSearchDependenciesLayer),
  );
  const rssWorkerDependenciesLayer = Layer.mergeAll(
    input.runtimeSupportLayer,
    searchBackgroundRssLayer,
    searchBackgroundMissingLayer,
    input.operationsProgressLayer,
  );
  const backgroundSearchRssWorkerLayer = BackgroundSearchRssWorkerServiceLive.pipe(
    Layer.provideMerge(rssWorkerDependenciesLayer),
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
