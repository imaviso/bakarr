import { type DatabaseError } from "@/db/database.ts";
import { makeLatestValuePublisher } from "@/infra/effect/coalescing-latest-value-publisher.ts";
import { makeSerializedDrainEffectRunner } from "@/infra/effect/serialized-runner.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import type { StoredDataError } from "@/features/errors.ts";
import { Effect } from "effect";

export const makeOperationsProgressPublishers = Effect.fn(
  "ProgressPublishers.makeProgressPublishers",
)(function* (input: {
  eventBus: typeof EventBus.Service;
  publishDownloadProgressEffect: Effect.Effect<void, DatabaseError | StoredDataError>;
}) {
  const coalescedDownloadProgressPublisher = yield* makeSerializedDrainEffectRunner(
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
