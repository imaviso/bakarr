import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { EventBus } from "../events/event-bus.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import { ExternalCallError, type OperationsError } from "./errors.ts";
import type { TryDatabasePromise } from "./service-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";

export interface TriggerDownloadInput {
  readonly anime_id: number;
  readonly magnet: string;
  readonly episode_number?: number;
  readonly title: string;
  readonly group?: string;
  readonly info_hash?: string;
  readonly is_batch?: boolean;
  readonly decision_reason?: string;
  readonly release_metadata?:
    import("../../../../../packages/shared/src/index.ts").DownloadSourceMetadata;
}

export interface DownloadOrchestrationInput {
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  readonly dbError: (message: string) => (cause: unknown) => DatabaseError;
  readonly maybeQBitConfig: (config: Config) => QBitConfig | null;
  readonly triggerSemaphore: Effect.Semaphore;
}

export function resolveRequestedEpisodeNumber(input: {
  readonly explicitEpisode?: number;
  readonly inferredEpisodes: readonly number[];
  readonly isBatch: boolean;
}) {
  if (input.explicitEpisode && input.explicitEpisode > 0) {
    return input.explicitEpisode;
  }

  const inferredEpisode = input.inferredEpisodes[0];
  if (inferredEpisode && inferredEpisode > 0) {
    return inferredEpisode;
  }

  if (input.isBatch) {
    return 1;
  }

  return undefined;
}

export function mapQBitState(state: string): string {
  const value = state.toLowerCase();

  if (value.includes("error") || value.includes("missing")) {
    return "error";
  }

  if (
    value.includes("uploading") || value.includes("pausedup") ||
    value.includes("queuedup") || value.includes("stalledup") ||
    value.includes("checkingup") || value.includes("forcedup") ||
    value.includes("completed")
  ) {
    return "completed";
  }

  if (value.includes("pauseddl")) {
    return "paused";
  }

  if (value.includes("queueddl")) {
    return "queued";
  }

  if (
    value.includes("downloading") || value.includes("forceddl") ||
    value.includes("metadl") || value.includes("stalleddl") ||
    value.includes("checkingdl") || value.includes("allocating") ||
    value.includes("checkingresumedata") || value.includes("moving")
  ) {
    return "downloading";
  }

  if (value.includes("queued")) {
    return "queued";
  }

  if (value.includes("paused")) {
    return "paused";
  }

  return "queued";
}
