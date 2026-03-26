import { Effect, Exit, Scope } from "effect";

import type { DatabaseError } from "../../db/database.ts";
import {
  makeCoalescedEffectRunner,
  makeLatestValuePublisher,
  makeSerializedFlagCoordinator,
} from "../../lib/effect-coalescing.ts";
import { EventBus } from "../events/event-bus.ts";

export interface OperationsCoordinationShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: (loop: Effect.Effect<void>) => Effect.Effect<void>;
  readonly runExclusiveDownloadTrigger: <A, E>(
    operation: Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>;
  readonly tryBeginUnmappedScan: () => Effect.Effect<boolean>;
}

export const makeOperationsSharedState = Effect.fn("OperationsService.makeSharedState")(
  function* () {
    const coordinator = yield* makeSerializedFlagCoordinator();
    const scope = yield* Scope.make();

    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));

    return {
      completeUnmappedScan: () => coordinator.finish,
      forkUnmappedScanLoop: (loop: Effect.Effect<void>) =>
        Effect.forkIn(scope)(loop).pipe(Effect.asVoid),
      runExclusiveDownloadTrigger: <A, E>(operation: Effect.Effect<A, E>) =>
        coordinator.runSerialized(operation),
      tryBeginUnmappedScan: () => coordinator.tryStart,
    } satisfies OperationsCoordinationShape;
  },
);

export const makeOperationsProgressPublishers = Effect.fn(
  "OperationsService.makeProgressPublishers",
)(function* (input: {
  eventBus: typeof EventBus.Service;
  publishDownloadProgressEffect: Effect.Effect<void, DatabaseError>;
}) {
  const coalescedDownloadProgressPublisher = yield* makeCoalescedEffectRunner(
    input.publishDownloadProgressEffect,
  );
  const libraryScanProgressPublisher = yield* makeLatestValuePublisher((scanned: number) =>
    input.eventBus.publish({
      type: "LibraryScanProgress",
      payload: { scanned },
    }),
  );
  const rssCheckProgressPublisher = yield* makeLatestValuePublisher(
    (payload: { current: number; total: number; feed_name: string }) =>
      input.eventBus.publish({
        type: "RssCheckProgress",
        payload,
      }),
  );

  yield* Effect.addFinalizer(() =>
    Effect.all([libraryScanProgressPublisher.shutdown, rssCheckProgressPublisher.shutdown], {
      concurrency: "unbounded",
      discard: true,
    }),
  );

  return {
    publishDownloadProgress: () => coalescedDownloadProgressPublisher.trigger,
    publishLibraryScanProgress: libraryScanProgressPublisher.offer,
    publishRssCheckProgress: rssCheckProgressPublisher.offer,
  };
});
