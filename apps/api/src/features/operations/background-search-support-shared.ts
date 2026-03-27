import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase, DatabaseError } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { type OperationsError, OperationsInputError } from "./errors.ts";
import { type ParsedRelease, RssClient } from "./rss-client.ts";
import { type QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import { loadQualityProfile } from "./repository.ts";
import type { OperationsCoordinationShape } from "./runtime-support.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";
import { EventBus } from "../events/event-bus.ts";

export interface BackgroundSearchSupportInput {
  db: AppDatabase;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  coordination: OperationsCoordinationShape;
  eventBus: typeof EventBus.Service;
  maybeQBitConfig: (config: Config) => QBitConfig | null;
  nowIso: () => Effect.Effect<string>;
  qbitClient: typeof QBitTorrentClient.Service;
  rssClient: typeof RssClient.Service;
  publishDownloadProgress: () => Effect.Effect<void, DatabaseError>;
  publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
  searchEpisodeReleases: (
    animeRow: typeof anime.$inferSelect,
    episodeNumber: number,
    config: Config,
  ) => Effect.Effect<readonly ParsedRelease[], ExternalCallError | OperationsError | DatabaseError>;
  tryDatabasePromise: TryDatabasePromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
}

export function makeBackgroundSearchSupportShared(input: BackgroundSearchSupportInput) {
  const { db } = input;

  const logSearchMissingSkip = (input: {
    animeId: number;
    episodeNumber: number;
    reason: string;
  }) =>
    Effect.logDebug("Skipping missing-episode background action").pipe(
      Effect.annotateLogs({
        animeId: input.animeId,
        episodeNumber: input.episodeNumber,
        reason: input.reason,
      }),
    );

  const logRssSkip = (input: {
    animeId?: number;
    feedId: number;
    feedName: string;
    reason: string;
  }) =>
    Effect.logDebug("Skipping RSS background action").pipe(
      Effect.annotateLogs({
        animeId: input.animeId,
        feedId: input.feedId,
        feedName: input.feedName,
        reason: input.reason,
      }),
    );

  const requireQualityProfile = Effect.fn("OperationsService.requireQualityProfile")(function* (
    profileName: string,
  ) {
    const profile = yield* loadQualityProfile(db, profileName);

    if (!profile) {
      return yield* new OperationsInputError({
        message: `Quality profile '${profileName}' not found`,
      });
    }

    return profile;
  });

  return {
    logRssSkip,
    logSearchMissingSkip,
    requireQualityProfile,
  };
}

export type BackgroundSearchSupportShared = ReturnType<typeof makeBackgroundSearchSupportShared>;
