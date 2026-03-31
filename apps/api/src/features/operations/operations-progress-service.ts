import { Context, Effect, Layer } from "effect";

import { EventBus } from "@/features/events/event-bus.ts";
import { makeOperationsProgressPublishers } from "@/features/operations/operations-progress-publishers.ts";
import { DownloadWorkflow } from "@/features/operations/download-workflow-service.ts";
import { type DatabaseError } from "@/db/database.ts";
import type { OperationsInfrastructureError } from "@/features/operations/errors.ts";

export interface OperationsProgressShape {
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
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
    const downloadWorkflow = yield* DownloadWorkflow;

    return yield* makeOperationsProgressPublishers({
      eventBus,
      publishDownloadProgressEffect: downloadWorkflow.publishDownloadProgress(),
    });
  }),
);
