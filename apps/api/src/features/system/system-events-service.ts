import { Effect, Stream } from "effect";

import type { DownloadStatus, NotificationEvent } from "@packages/shared/index.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { DownloadProgressService } from "@/features/operations/download/download-progress-service.ts";

const makeSystemEventsService = Effect.fn("SystemEventsService.make")(function* () {
  const eventBus = yield* EventBus;
  const downloadProgress = yield* DownloadProgressService;

  const buildEventsStream = () =>
    eventBus.withSubscriptionStream((subscription) =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          const downloads: readonly DownloadStatus[] =
            yield* downloadProgress.getDownloadProgressBootstrap();
          const bufferedEvents = yield* subscription.takeBufferedOnce;

          return buildDownloadProgressEventStream(downloads, bufferedEvents, subscription.stream);
        }),
      ),
    );

  return { buildEventsStream };
});

export class SystemEventsService extends Effect.Service<SystemEventsService>()(
  "@bakarr/api/SystemEventsService",
  {
    effect: makeSystemEventsService(),
  },
) {}

export const SystemEventsServiceLive = SystemEventsService.Default;

function buildDownloadProgressEventStream(
  downloads: readonly DownloadStatus[],
  bufferedEvents: readonly NotificationEvent[],
  stream: Stream.Stream<NotificationEvent>,
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
    stream.pipe(Stream.withSpan("system.events.stream")),
  );
}
