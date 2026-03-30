import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { downloads, rssFeeds } from "@/db/schema.ts";
import {
  loadMissingEpisodeNumbers,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
} from "@/features/operations/job-support.ts";
import {
  parseEpisodeFromTitle,
  decideDownloadAction,
} from "@/features/operations/release-ranking.ts";
import { loadCurrentEpisodeState } from "@/features/operations/repository/anime-repository.ts";
import { loadReleaseRules } from "@/features/operations/repository/profile-repository.ts";
import { loadRuntimeConfig } from "@/features/operations/repository/config-repository.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { makeBackgroundSearchQueueSupport } from "@/features/operations/background-search-queue-support.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import type {
  BackgroundSearchSupportInput,
  BackgroundSearchSupportShared,
} from "@/features/operations/background-search-support-shared.ts";

export function makeBackgroundSearchRssSupport(
  input: BackgroundSearchSupportInput,
  shared: BackgroundSearchSupportShared,
) {
  const {
    db,
    eventBus,
    rssClient,
    maybeQBitConfig,
    nowIso,
    publishDownloadProgress,
    publishRssCheckProgress,
    tryDatabasePromise,
  } = input;

  const logRssSkip = shared.logRssSkip;
  const requireQualityProfile = shared.requireQualityProfile;
  const { queueReleaseIfEligible } = makeBackgroundSearchQueueSupport(input);

  const runRssCheckBase = Effect.fn("OperationsService.runRssCheckBase")(function* () {
    yield* markJobStarted(db, "rss", nowIso);

    return yield* Effect.gen(function* () {
      const feeds = yield* tryDatabasePromise("Failed to run RSS check", () =>
        db.select().from(rssFeeds).where(eq(rssFeeds.enabled, true)),
      );
      const runtimeConfig = yield* loadRuntimeConfig(db);
      let newItems = 0;

      yield* eventBus.publish({ type: "RssCheckStarted" });

      const processRssFeed = Effect.fn("operations.rss.feed")(function* (
        feed: (typeof feeds)[number],
        _index: number,
      ) {
        const items = yield* rssClient.fetchItems(feed.url).pipe(
          Effect.mapError((error) =>
            error instanceof DatabaseError
              ? error
              : new OperationsInfrastructureError({
                  message: `Failed to fetch RSS feed '${feed.name ?? feed.url}'`,
                  cause: error,
                }),
          ),
        );
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
          const action = decideDownloadAction(profile, rules, currentEpisode, item, runtimeConfig);

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

          const queueResult = yield* queueReleaseIfEligible({
            action,
            animeRow,
            contextMessage: "Failed to run RSS check",
            episodeNumber,
            eventMessage: `Queued ${item.title} from RSS`,
            eventType: "download.rss.queued",
            item,
            missingEpisodes: yield* loadMissingEpisodeNumbers(db, animeRow.id),
            qbitConfig: maybeQBitConfig(runtimeConfig),
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
          db.update(rssFeeds).set({ lastChecked: feedCheckedAt }).where(eq(rssFeeds.id, feed.id)),
        );

        return queuedForFeed;
      });

      for (const [index, feed] of feeds.entries()) {
        yield* publishRssCheckProgress({
          current: index + 1,
          total: feeds.length,
          feed_name: feed.name ?? feed.url,
        });

        newItems += yield* processRssFeed(feed, index);
      }

      yield* markJobSucceeded(db, "rss", `Queued ${newItems} release(s)`, nowIso);
      yield* eventBus.publish({
        type: "RssCheckFinished",
        payload: { new_items: newItems, total_feeds: feeds.length },
      });
      yield* publishDownloadProgress();

      return { newItems };
    }).pipe(
      Effect.withSpan("operations.rss.check"),
      Effect.catchAll((cause) =>
        markJobFailed(db, "rss", cause, nowIso).pipe(
          Effect.zipRight(
            Effect.fail(
              cause instanceof DatabaseError
                ? cause
                : new OperationsInfrastructureError({
                    message: "Failed to run RSS check",
                    cause,
                  }),
            ),
          ),
        ),
      ),
    );
  });

  const runRssCheck = Effect.fn("OperationsService.runRssCheck")(function* () {
    return yield* runRssCheckBase().pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : new OperationsInfrastructureError({
              message: "Failed to run RSS check",
              cause: error,
            }),
      ),
    );
  });

  return {
    runRssCheck,
  };
}
