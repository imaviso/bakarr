import { Context, Effect, Layer, Stream } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { CatalogDownloadReadService } from "@/features/operations/catalog-download-read-service.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { buildDownloadProgressStream } from "@/http/event-stream.ts";

export interface SystemEventsServiceShape {
  readonly buildEventsStream: () => Effect.Effect<
    Stream.Stream<Uint8Array>,
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
      return buildDownloadProgressStream(downloads, eventBus);
    });

    return SystemEventsService.of({ buildEventsStream });
  }),
);
