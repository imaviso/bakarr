import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "../../db/database.ts";
import { EventBus } from "../events/event-bus.ts";
import { DownloadProgressService } from "./download-service-tags.ts";
import { makeOperationsProgressPublishers } from "./runtime-support.ts";

export interface OperationsProgressShape {
  readonly publishDownloadProgress: () => Effect.Effect<void, DatabaseError>;
  readonly publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  readonly publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
}

export class OperationsProgress extends Context.Tag("@bakarr/api/OperationsProgress")<
  OperationsProgress,
  OperationsProgressShape
>() {}

export const ProgressLive = Layer.scoped(
  OperationsProgress,
  Effect.gen(function* () {
    const eventBus = yield* EventBus;
    const downloadProgress = yield* DownloadProgressService;

    return yield* makeOperationsProgressPublishers({
      eventBus,
      publishDownloadProgressEffect: downloadProgress.publishDownloadProgress(),
    });
  }),
);
