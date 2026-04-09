import { Layer } from "effect";

export type AnyLayer = Layer.Layer<any, any, never>;

export const provideLayer = <A, E, R, DOut, DE, DR>(
  layer: Layer.Layer<A, E, R>,
  dependencies: Layer.Layer<DOut, DE, DR>,
) => layer.pipe(Layer.provideMerge(dependencies));

export const provideFrom =
  <DOut, DE, DR>(dependencies: Layer.Layer<DOut, DE, DR>) =>
  <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    provideLayer(layer, dependencies);
