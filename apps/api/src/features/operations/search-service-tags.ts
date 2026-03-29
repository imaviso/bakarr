import { Context, Effect, Layer } from "effect";

import {
  SearchBackgroundService,
  SearchBackgroundServiceLive,
  type SearchBackgroundServiceShape,
} from "./search-background-service.ts";
import {
  SearchEpisodeService,
  SearchEpisodeServiceLive,
  type SearchEpisodeServiceShape,
} from "./search-episode-service.ts";
import {
  SearchImportPathService,
  SearchImportPathServiceLive,
  type SearchImportPathServiceShape,
} from "./search-import-path-service.ts";
import {
  SearchReleaseService,
  SearchReleaseServiceLive,
  type SearchReleaseServiceShape,
} from "./search-release-service.ts";
import {
  SearchUnmappedService,
  SearchUnmappedServiceLive,
  type SearchUnmappedServiceShape,
} from "./search-unmapped-service.ts";

export type SearchWorkflowShape = SearchBackgroundServiceShape &
  SearchEpisodeServiceShape &
  SearchImportPathServiceShape &
  SearchReleaseServiceShape &
  SearchUnmappedServiceShape;

export class SearchWorkflow extends Context.Tag("@bakarr/api/SearchWorkflow")<
  SearchWorkflow,
  SearchWorkflowShape
>() {}

export const makeSearchWorkflow = Effect.gen(function* () {
  const backgroundSearchService = yield* SearchBackgroundService;
  const searchEpisodeService = yield* SearchEpisodeService;
  const searchImportPathService = yield* SearchImportPathService;
  const searchReleaseService = yield* SearchReleaseService;
  const searchUnmappedService = yield* SearchUnmappedService;

  return {
    ...backgroundSearchService,
    ...searchEpisodeService,
    ...searchImportPathService,
    ...searchReleaseService,
    ...searchUnmappedService,
  } satisfies SearchWorkflowShape;
});

const searchReleaseLayer = SearchReleaseServiceLive;

const searchWorkflowDependenciesLayer = Layer.mergeAll(
  SearchBackgroundServiceLive.pipe(Layer.provideMerge(searchReleaseLayer)),
  SearchEpisodeServiceLive.pipe(Layer.provideMerge(searchReleaseLayer)),
  SearchImportPathServiceLive,
  SearchUnmappedServiceLive,
);

export const SearchWorkflowLive = Layer.effect(SearchWorkflow, makeSearchWorkflow).pipe(
  Layer.provideMerge(searchReleaseLayer),
  Layer.provide(searchWorkflowDependenciesLayer),
);
