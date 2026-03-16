import { Effect, Ref } from "effect";

import type { DatabaseError } from "../../db/database.ts";
import {
  makeCoalescedEffectRunner,
  makeLatestValuePublisher,
} from "../../lib/effect-coalescing.ts";
import { EventBus } from "../events/event-bus.ts";

export const makeOperationsSharedState = Effect.fn(
  "OperationsService.makeSharedState",
)(function* () {
  const triggerSemaphore = yield* Effect.makeSemaphore(1);
  const unmappedScanRunning = yield* Ref.make(false);

  return { triggerSemaphore, unmappedScanRunning };
});

export const makeOperationsProgressPublishers = Effect.fn(
  "OperationsService.makeProgressPublishers",
)(function* (input: {
  eventBus: typeof EventBus.Service;
  publishDownloadProgressEffect: Effect.Effect<void, DatabaseError>;
}) {
  const coalescedDownloadProgressPublisher = yield* makeCoalescedEffectRunner(
    input.publishDownloadProgressEffect,
  );
  const libraryScanProgressPublisher = yield* makeLatestValuePublisher(
    (scanned: number) =>
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

  return {
    publishDownloadProgress: () => coalescedDownloadProgressPublisher.trigger,
    publishLibraryScanProgress: libraryScanProgressPublisher.offer,
    publishRssCheckProgress: rssCheckProgressPublisher.offer,
  };
});
