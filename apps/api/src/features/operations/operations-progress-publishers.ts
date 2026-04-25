import { Effect } from "effect";

import { type DatabaseError } from "@/db/database.ts";
import { makeCoalescedEffectRunner } from "@/infra/effect/coalescing-coalesced-runner.ts";
import { makeLatestValuePublisher } from "@/infra/effect/coalescing-latest-value-publisher.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import type { OperationsInfrastructureError } from "@/features/operations/errors.ts";

export const makeOperationsProgressPublishers = Effect.fn(
  "OperationsService.makeProgressPublishers",
)(function* (input: {
  eventBus: typeof EventBus.Service;
  publishDownloadProgressEffect: Effect.Effect<void, DatabaseError | OperationsInfrastructureError>;
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
