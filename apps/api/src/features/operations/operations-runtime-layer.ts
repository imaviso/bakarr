import { Layer } from "effect";

import {
  CatalogLibraryReadSupportLive,
  CatalogOrchestrationLive,
  DownloadOrchestrationLive,
  OperationsSharedStateLive,
  ProgressLive,
  SearchOrchestrationLive,
} from "./operations-orchestration.ts";
import { LibraryCommandServiceLive, LibraryReadServiceLive } from "./library-service-live.ts";
import {
  DownloadControlServiceLive,
  DownloadStatusServiceLive,
  DownloadTriggerServiceLive,
} from "./download-service-live.ts";
import { RssCommandServiceLive, RssReadServiceLive } from "./rss-service-live.ts";
import { SearchServiceLive } from "./search-service-live.ts";

export function makeOperationsRuntimeLayer<Out, Err, In>(platformLayer: Layer.Layer<Out, Err, In>) {
  const downloadOrchestrationLayer = DownloadOrchestrationLive.pipe(
    Layer.provide(OperationsSharedStateLive),
  );
  const progressLayer = ProgressLive.pipe(Layer.provide(downloadOrchestrationLayer));
  const searchOrchestrationLayer = SearchOrchestrationLive.pipe(
    Layer.provide(Layer.mergeAll(OperationsSharedStateLive, progressLayer)),
  );
  const catalogOrchestrationLayer = CatalogOrchestrationLive.pipe(
    Layer.provide(
      Layer.mergeAll(downloadOrchestrationLayer, progressLayer, CatalogLibraryReadSupportLive),
    ),
  );
  const orchestrationLayer = Layer.mergeAll(
    downloadOrchestrationLayer,
    progressLayer,
    searchOrchestrationLayer,
    catalogOrchestrationLayer,
  ).pipe(Layer.provide(platformLayer));
  const servicesLayer = Layer.mergeAll(
    RssReadServiceLive,
    RssCommandServiceLive,
    LibraryReadServiceLive,
    LibraryCommandServiceLive,
    DownloadStatusServiceLive,
    DownloadControlServiceLive,
    DownloadTriggerServiceLive,
    SearchServiceLive,
  ).pipe(Layer.provide(Layer.mergeAll(platformLayer, orchestrationLayer)));

  return Layer.mergeAll(orchestrationLayer, servicesLayer);
}
