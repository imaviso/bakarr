import { Context, Effect, Layer, Stream } from "effect";

import type { DownloadStatus, NotificationEvent } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { CatalogDownloadReadService } from "@/features/operations/catalog-download-read-service.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";

export interface SystemEventsServiceShape {
  readonly buildEventsStream: () => Stream.Stream<
    NotificationEvent,
    DatabaseError | OperationsStoredDataError
  >;
}

export class SystemEventsService extends Context.Tag("@bakarr/api/SystemEventsService")<
  SystemEventsService,
  SystemEventsServiceShape
>() {}

export const SystemEventsServiceLive = Layer.effect(
  SystemEventsService,
  Effect.gen(function* () {
    const eventBus = yield* EventBus;
    const downloadsReadService = yield* CatalogDownloadReadService;

    const buildEventsStream = () =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          const subscription = yield* eventBus.subscribe();
          const downloads: readonly DownloadStatus[] =
            yield* downloadsReadService.getDownloadProgressBootstrap();
          const bufferedEvents = yield* subscription.takeBuffered;

          return buildDownloadProgressEventStream(downloads, bufferedEvents, subscription);
        }),
      );

    return SystemEventsService.of({ buildEventsStream });
  }),
);

function buildDownloadProgressEventStream(
  downloads: readonly DownloadStatus[],
  bufferedEvents: readonly NotificationEvent[],
  subscription: import("@/features/events/event-bus.ts").EventSubscription,
) {
  const latestBufferedDownloadProgress = bufferedEvents.reduce<NotificationEvent | undefined>(
    (latest, event) => (event.type === "DownloadProgress" ? event : latest),
    undefined,
  );
  const initialDownloads =
    latestBufferedDownloadProgress?.type === "DownloadProgress"
      ? latestBufferedDownloadProgress.payload.downloads
      : downloads;
  const pendingEvents = bufferedEvents.filter((event) => event.type !== "DownloadProgress");

  return Stream.concat(
    Stream.fromIterable<NotificationEvent>([
      {
        type: "DownloadProgress",
        payload: { downloads: [...initialDownloads] },
      },
      ...pendingEvents,
    ]),
    subscription.stream.pipe(Stream.withSpan("system.events.stream")),
  );
}
