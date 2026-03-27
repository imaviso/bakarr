import { Context, Effect, Layer } from "effect";

import { makeOperationsSharedState } from "./runtime-support.ts";

export interface OperationsSharedStateShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: (loop: Effect.Effect<void>) => Effect.Effect<void>;
  readonly runExclusiveDownloadTrigger: <A, E>(
    operation: Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>;
  readonly tryBeginUnmappedScan: () => Effect.Effect<boolean>;
}

export class OperationsSharedState extends Context.Tag("@bakarr/api/OperationsSharedState")<
  OperationsSharedState,
  OperationsSharedStateShape
>() {}

export const OperationsSharedStateLive = Layer.scoped(
  OperationsSharedState,
  makeOperationsSharedState(),
);
