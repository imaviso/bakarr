/**
 * Public re-exports for the operations feature.
 *
 * Service contracts (tags + shapes) are in service-contract.ts.
 * Live implementations are in the *-service-live.ts files.
 * Orchestration internals live in operations-orchestration.ts.
 *
 * This file exists only to keep external imports stable during the transition.
 */

export {
  DownloadService,
  type DownloadServiceShape,
  LibraryService,
  type LibraryServiceShape,
  RssService,
  type RssServiceShape,
  SearchService,
  type SearchServiceShape,
} from "./service-contract.ts";

export {
  applyRemotePathMappings,
  inferCoveredEpisodeNumbers,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
} from "./download-lifecycle.ts";

export { mapQBitState } from "./download-orchestration-shared.ts";

export {
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "./naming-support.ts";

// Convenience: the assembled live layer used by runtime.ts
export { DownloadServiceLive } from "./download-service-live.ts";
export { LibraryServiceLive } from "./library-service-live.ts";
export { RssServiceLive } from "./rss-service-live.ts";
export { SearchServiceLive } from "./search-service-live.ts";
export { operationsOrchestrationLayer } from "./operations-orchestration.ts";
