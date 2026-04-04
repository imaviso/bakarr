import { eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { downloads, rssFeeds } from "@/db/schema.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import { BackgroundSearchQueueService } from "@/features/operations/background-search-queue-service.ts";
import {
  OperationsInfrastructureError,
  OperationsInputError,
} from "@/features/operations/errors.ts";
import { loadMissingEpisodeNumbers } from "@/features/operations/job-support.ts";
import {
  parseEpisodeFromTitle,
  decideDownloadAction,
  validateQualityProfileSizeLabels,
} from "@/features/operations/release-ranking.ts";
import { loadCurrentEpisodeState } from "@/features/operations/repository/anime-repository.ts";
import {
  loadQualityProfile,
  loadReleaseRules,
} from "@/features/operations/repository/profile-repository.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export interface BackgroundSearchRssFeedServiceShape {
  readonly processFeed: (
    feed: typeof rssFeeds.$inferSelect,
    runtimeConfig: Config,
  ) => Effect.Effect<number, DatabaseError | OperationsInfrastructureError>;
}

export class BackgroundSearchRssFeedService extends Context.Tag(
  "@bakarr/api/BackgroundSearchRssFeedService",
)<BackgroundSearchRssFeedService, BackgroundSearchRssFeedServiceShape>() {}

export const BackgroundSearchRssFeedServiceLive = Layer.effect(
  BackgroundSearchRssFeedService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;
    const rssClient = yield* RssClient;
    const queueService = yield* BackgroundSearchQueueService;
    const nowIso = () => nowIsoFromClock(clock);

    const requireQualityProfile = Effect.fn("BackgroundSearchRssFeed.requireQualityProfile")(
      function* (profileName: string) {
        const profileOption = yield* loadQualityProfile(db, profileName);

        if (Option.isNone(profileOption)) {
          return yield* new OperationsInputError({
            message: `Quality profile '${profileName}' not found`,
          });
        }

        return profileOption.value;
      },
    );

    const logRssSkip = Effect.fn("BackgroundSearchRssFeed.logRssSkip")(function* (input: {
      animeId?: number;
      feedId: number;
      feedName: string;
      reason: string;
    }) {
      yield* Effect.logDebug("Skipping RSS background action").pipe(
        Effect.annotateLogs({
          animeId: input.animeId,
          feedId: input.feedId,
          feedName: input.feedName,
          reason: input.reason,
        }),
      );
    });

    const processFeed = Effect.fn("BackgroundSearchRssFeedService.processFeed")(function* (
      feed: typeof rssFeeds.$inferSelect,
      runtimeConfig: Config,
    ) {
      return yield* rssClient.fetchItems(feed.url).pipe(
        Effect.mapError((error) =>
          error instanceof DatabaseError
            ? error
            : new OperationsInfrastructureError({
                message: `Failed to fetch RSS feed '${feed.name ?? feed.url}'`,
                cause: error,
              }),
        ),
        Effect.flatMap((items) =>
          Effect.gen(function* () {
            const animeRow = yield* requireAnime(db, feed.animeId);

            if (!animeRow.monitored) {
              yield* logRssSkip({
                animeId: animeRow.id,
                feedId: feed.id,
                feedName: feed.name ?? feed.url,
                reason: "anime is not monitored",
              });
              return 0;
            }

            const profile = yield* requireQualityProfile(animeRow.profileName);
            yield* validateQualityProfileSizeLabels(profile);
            const rules = yield* loadReleaseRules(db, animeRow);
            let queuedForFeed = 0;

            const slice = items.slice(0, 10);
            if (slice.length === 0) {
              yield* logRssSkip({
                animeId: animeRow.id,
                feedId: feed.id,
                feedName: feed.name ?? feed.url,
                reason: "feed returned no items",
              });
              const feedCheckedAt = yield* nowIso();
              yield* tryDatabasePromise("Failed to run RSS check", () =>
                db
                  .update(rssFeeds)
                  .set({ lastChecked: feedCheckedAt })
                  .where(eq(rssFeeds.id, feed.id)),
              );
              return 0;
            }

            const existingDownloads = yield* tryDatabasePromise("Failed to run RSS check", () =>
              db
                .select({ infoHash: downloads.infoHash })
                .from(downloads)
                .where(
                  inArray(
                    downloads.infoHash,
                    slice.map((item) => item.infoHash),
                  ),
                ),
            );
            const existingHashes = new Set(existingDownloads.map((d) => d.infoHash?.toLowerCase()));
            const missingEpisodes = yield* loadMissingEpisodeNumbers(db, animeRow.id);

            for (const item of slice) {
              if (existingHashes.has(item.infoHash.toLowerCase())) {
                yield* logRssSkip({
                  animeId: animeRow.id,
                  feedId: feed.id,
                  feedName: feed.name ?? feed.url,
                  reason: `item already queued: ${item.infoHash}`,
                });
                continue;
              }

              const episodeNumber = parseEpisodeFromTitle(item.title);

              if (episodeNumber == null) {
                yield* logRssSkip({
                  animeId: animeRow.id,
                  feedId: feed.id,
                  feedName: feed.name ?? feed.url,
                  reason: `could not parse episode number: ${item.title}`,
                });
                continue;
              }

              const currentEpisode = yield* loadCurrentEpisodeState(db, animeRow.id, episodeNumber);
              const action = decideDownloadAction(
                profile,
                rules,
                currentEpisode,
                item,
                runtimeConfig,
              );

              if (!(action.Accept || action.Upgrade)) {
                yield* logRssSkip({
                  animeId: animeRow.id,
                  feedId: feed.id,
                  feedName: feed.name ?? feed.url,
                  reason: `release not accepted: ${item.title}`,
                });
                continue;
              }

              const decisionReason =
                action.Upgrade?.reason ??
                (action.Accept
                  ? `Accepted (${action.Accept.quality.name}, score ${action.Accept.score})`
                  : undefined);

              const queueResult = yield* queueService.queueReleaseIfEligible({
                action,
                animeRow,
                contextMessage: "Failed to run RSS check",
                episodeNumber,
                eventMessage: `Queued ${item.title} from RSS`,
                eventType: "download.rss.queued",
                item,
                missingEpisodes,
                decisionReason,
              });

              if (queueResult._tag === "skipped") {
                yield* logRssSkip({
                  animeId: animeRow.id,
                  feedId: feed.id,
                  feedName: feed.name ?? feed.url,
                  reason: `overlapping download already queued: ${item.infoHash}`,
                });
                continue;
              }

              queuedForFeed += 1;
            }

            const feedCheckedAt = yield* nowIso();
            yield* tryDatabasePromise("Failed to run RSS check", () =>
              db
                .update(rssFeeds)
                .set({ lastChecked: feedCheckedAt })
                .where(eq(rssFeeds.id, feed.id)),
            );

            return queuedForFeed;
          }).pipe(
            Effect.catchTag("OperationsAnimeNotFoundError", (error) =>
              Effect.fail(
                new OperationsInfrastructureError({
                  message: "Failed to run RSS check",
                  cause: error,
                }),
              ),
            ),
            Effect.catchTag("OperationsInputError", (error) =>
              Effect.fail(
                new OperationsInfrastructureError({
                  message: "Failed to run RSS check",
                  cause: error,
                }),
              ),
            ),
          ),
        ),
      );
    });

    return BackgroundSearchRssFeedService.of({
      processFeed,
    });
  }),
);
