import { assert, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";

import { brandMediaId, brandDownloadId } from "@packages/shared/index.ts";
import { makeEventBus, EventBus } from "@/features/events/event-bus.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import {
  SystemEventsService,
  SystemEventsServiceLive,
} from "@/features/system/system-events-service.ts";

it.scoped("SystemEventsService does not lose buffered events during stream bootstrap", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus();
    const latestDownloads = [sampleDownload("downloading")];
    const snapshotDownloads = [sampleDownload("queued")];
    const systemEventsLayer = SystemEventsServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(EventBus, eventBus),
          Layer.succeed(
            OperationsProgress,
            OperationsProgress.make({
              getDownloadProgress: () => Effect.succeed(snapshotDownloads),
              getDownloadProgressBootstrap: () =>
                Effect.gen(function* () {
                  yield* eventBus.publish({ type: "Info", payload: { message: "bootstrapping" } });
                  yield* eventBus.publish({
                    type: "DownloadProgress",
                    payload: { downloads: latestDownloads },
                  });
                  return snapshotDownloads;
                }),
              getDownloadRuntimeSummary: () => Effect.succeed({ active_count: 1 }),
              publishDownloadProgress: () => Effect.void,
              publishDownloadProgressNow: () => Effect.void,
              publishLibraryScanProgress: () => Effect.void,
              publishRssCheckProgress: () => Effect.void,
            }),
          ),
        ),
      ),
    );

    const events = yield* Effect.flatMap(SystemEventsService, (service) =>
      Stream.runCollect(service.buildEventsStream().pipe(Stream.take(2))),
    ).pipe(Effect.provide(systemEventsLayer));

    assert.deepStrictEqual(Array.from(events), [
      {
        type: "DownloadProgress",
        payload: { downloads: latestDownloads },
      },
      { type: "Info", payload: { message: "bootstrapping" } },
    ]);
  }),
);

function sampleDownload(state: string) {
  return {
    id: brandDownloadId(1),
    media_id: brandMediaId(10),
    media_image: undefined,
    media_title: "Sample Show",
    coverage_pending: undefined,
    covered_units: undefined,
    decision_reason: undefined,
    unit_number: 1,
    hash: "abcdef1234567890abcdef1234567890abcdef12",
    imported_path: undefined,
    name: "Sample Show - 01",
    progress: 50,
    speed: 1024,
    eta: 60,
    source_metadata: undefined,
    state,
    total_bytes: 2048,
    downloaded_bytes: 1024,
    is_batch: false,
    allowed_actions: undefined,
  };
}
