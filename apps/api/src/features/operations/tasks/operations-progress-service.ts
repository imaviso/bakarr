import { Effect, Scope } from "effect";

import type { DownloadStatus } from "@packages/shared/index.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { makeOperationsProgressPublishers } from "@/features/operations/tasks/operations-progress-publishers.ts";
import { DownloadProgressService } from "@/features/operations/download/download-progress-service.ts";
import { type DatabaseError } from "@/db/database.ts";
import type { StoredDataError } from "@/features/errors.ts";

type ProgressError = DatabaseError | StoredDataError;

export interface OperationsProgressShape {
  readonly getDownloadProgress: () => Effect.Effect<DownloadStatus[], ProgressError>;
  readonly getDownloadProgressBootstrap: (input?: {
    readonly limit?: number;
  }) => Effect.Effect<DownloadStatus[], ProgressError>;
  readonly getDownloadRuntimeSummary: () => Effect.Effect<
    { readonly active_count: number },
    DatabaseError
  >;
  /** Coalesced download progress (workers). Immediate publish: DownloadProgressService. */
  readonly publishDownloadProgress: () => Effect.Effect<void, ProgressError>;
  readonly publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  readonly publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
}

export class OperationsProgress extends Effect.Service<OperationsProgress>()(
  "@bakarr/api/OperationsProgress",
  {
    scoped: Effect.gen(function* () {
      yield* Scope.Scope;
      const eventBus = yield* EventBus;
      const downloadProgress = yield* DownloadProgressService;

      const publishers = yield* makeOperationsProgressPublishers({
        eventBus,
        publishDownloadProgressEffect: downloadProgress.publishDownloadProgress(),
      });

      return {
        getDownloadProgress: downloadProgress.getDownloadProgress,
        getDownloadProgressBootstrap: downloadProgress.getDownloadProgressBootstrap,
        getDownloadRuntimeSummary: downloadProgress.getDownloadRuntimeSummary,
        publishDownloadProgress: publishers.publishDownloadProgress,
        publishLibraryScanProgress: publishers.publishLibraryScanProgress,
        publishRssCheckProgress: publishers.publishRssCheckProgress,
      } satisfies OperationsProgressShape;
    }),
  },
) {}

export const OperationsProgressLive = OperationsProgress.Default;
