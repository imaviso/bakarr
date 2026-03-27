import { Layer } from "effect";

import { DiskSpaceInspectorLive } from "./features/system/disk-space.ts";
import { MediaProbeLive } from "./lib/media-probe.ts";

export function makeAppPlatformCommandExecutorLayer<Out, Err, In>(
  platformLayer: Layer.Layer<Out, Err, In>,
) {
  return Layer.mergeAll(DiskSpaceInspectorLive, MediaProbeLive).pipe(Layer.provide(platformLayer));
}
