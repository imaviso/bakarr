import { assert, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";

import { brandMediaId, brandDownloadId, type DownloadStatus } from "@packages/shared/index.ts";
import { makeEventBus, EventBus } from "@/features/events/event-bus.ts";
import { CatalogDownloadReadService } from "@/features/operations/catalog/catalog-download-read-service.ts";
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
          Layer.succeed(CatalogDownloadReadService, {
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
            listDownloadEvents: () => Effect.dieMessage("unused in test"),
            listDownloadHistory: () => Effect.dieMessage("unused in test"),
            listDownloadQueue: () => Effect.dieMessage("unused in test"),
            streamDownloadEventsExportCsv: () => Effect.dieMessage("unused in test"),
            streamDownloadEventsExportJson: () => Effect.dieMessage("unused in test"),
          }),
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

function sampleDownload(state: DownloadStatus["state"]): DownloadStatus {
  return {
    id: brandDownloadId(1),
    media_id: brandMediaId(10),
    media_title: "Sample Show",
    unit_number: 1,
    hash: "abcdef1234567890abcdef1234567890abcdef12",
    name: "Sample Show - 01",
    progress: 50,
    speed: 1024,
    eta: 60,
    state,
    total_bytes: 2048,
    downloaded_bytes: 1024,
    is_batch: false,
  };
}
