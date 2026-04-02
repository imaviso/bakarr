import { Context, Effect, Layer, Stream } from "effect";

import type { DownloadStatus, NotificationEvent } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { CatalogDownloadReadService } from "@/features/operations/catalog-download-read-service.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";

export interface SystemEventsServiceShape {
  readonly buildEventsStream: () => Effect.Effect<
    Stream.Stream<NotificationEvent>,
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

    const buildEventsStream = Effect.fn("SystemEventsService.buildEventsStream")(function* () {
      const downloads: readonly DownloadStatus[] =
        yield* downloadsReadService.getDownloadProgressBootstrap();

      return buildDownloadProgressEventStream(downloads, eventBus);
    });

    return SystemEventsService.of({ buildEventsStream });
  }),
);

function buildDownloadProgressEventStream(
  downloads: readonly DownloadStatus[],
  eventBus: typeof EventBus.Service,
) {
  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const subscription = yield* eventBus.subscribe();
      const initialEvents = Stream.fromIterable<NotificationEvent>([
        {
          type: "DownloadProgress",
          payload: { downloads: [...downloads] },
        },
      ]);

      return Stream.concat(
        initialEvents,
        subscription.stream.pipe(Stream.withSpan("system.events.stream")),
      );
    }),
  );
}
