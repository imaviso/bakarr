import { Context, Effect, Layer } from "effect";

import {
  DownloadService,
  type DownloadServiceShape,
  LibraryService,
  type LibraryServiceShape,
  RssService,
  type RssServiceShape,
  SearchService,
  type SearchServiceShape,
} from "./service-contract.ts";

export type InternalOperationsShape =
  & RssServiceShape
  & LibraryServiceShape
  & DownloadServiceShape
  & SearchServiceShape;

export class InternalOperationsService
  extends Context.Tag("@bakarr/api/InternalOperationsService")<
    InternalOperationsService,
    InternalOperationsShape
  >() {}

export function projectOperationsServices<LE, R>(
  internalLayer: Layer.Layer<InternalOperationsService, LE, R>,
) {
  return Layer.mergeAll(
    Layer.effect(RssService, Effect.map(InternalOperationsService, (s) => s)),
    Layer.effect(
      LibraryService,
      Effect.map(InternalOperationsService, (s) => s),
    ),
    Layer.effect(
      DownloadService,
      Effect.map(InternalOperationsService, (s) => s),
    ),
    Layer.effect(
      SearchService,
      Effect.map(InternalOperationsService, (s) => s),
    ),
  ).pipe(Layer.provide(internalLayer));
}
