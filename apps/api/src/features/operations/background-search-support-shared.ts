import { Context, Effect, Layer } from "effect";

import type { Config, QualityProfile } from "@packages/shared/index.ts";
import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import type { AnimeRow } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import {
  type OperationsError,
  OperationsInputError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import type { BackgroundSearchQueueSupportInput } from "@/features/operations/background-search-queue-support.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import { loadQualityProfile } from "@/features/operations/repository/profile-repository.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import { Database } from "@/db/database.ts";

export interface BackgroundSearchMissingSupportInput extends BackgroundSearchQueueSupportInput {
  readonly eventBus: typeof EventBus.Service;
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
  readonly searchEpisodeReleases: (
    animeRow: AnimeRow,
    episodeNumber: number,
    config: Config,
  ) => Effect.Effect<readonly ParsedRelease[], ExternalCallError | OperationsError | DatabaseError>;
}

export interface BackgroundSearchRssSupportInput extends BackgroundSearchQueueSupportInput {
  readonly eventBus: typeof EventBus.Service;
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
  readonly publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
  readonly rssClient: typeof RssClient.Service;
}

export interface BackgroundSearchSupportShared {
  readonly logRssSkip: (input: {
    animeId?: number;
    feedId: number;
    feedName: string;
    reason: string;
  }) => Effect.Effect<void, never>;
  readonly logSearchMissingSkip: (input: {
    animeId: number;
    episodeNumber: number;
    reason: string;
  }) => Effect.Effect<void, never>;
  readonly requireQualityProfile: (
    profileName: string,
  ) => Effect.Effect<QualityProfile, DatabaseError | OperationsInputError>;
}

export class BackgroundSearchShared extends Context.Tag("@bakarr/api/BackgroundSearchShared")<
  BackgroundSearchShared,
  BackgroundSearchSupportShared
>() {}

export function makeBackgroundSearchSupportShared(input: { db: AppDatabase }) {
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
  } satisfies BackgroundSearchSupportShared;
}

export const BackgroundSearchSharedLive = Layer.effect(
  BackgroundSearchShared,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return makeBackgroundSearchSupportShared({ db });
  }),
);
