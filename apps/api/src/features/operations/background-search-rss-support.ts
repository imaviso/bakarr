import { eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { downloads, rssFeeds } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
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
import { BackgroundSearchQualityProfileService } from "@/features/operations/background-search-quality-profile-service.ts";
import { BackgroundSearchQueueService } from "@/features/operations/background-search-queue-service.ts";
import { BackgroundSearchRssRunnerService } from "@/features/operations/background-search-rss-runner-service.ts";
import { BackgroundSearchSkipLogService } from "@/features/operations/background-search-skip-log-service.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { OperationsProgress } from "@/features/operations/operations-progress-service.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

interface BackgroundSearchRssSupportInput {
  readonly db: typeof Database.Service.db;
  readonly eventBus: typeof EventBus.Service;
  readonly fetchItems: typeof BackgroundSearchRssRunnerService.Service.fetchItems;
  readonly logRssSkip: typeof BackgroundSearchSkipLogService.Service.logRssSkip;
  readonly nowIso: () => Effect.Effect<string>;
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
  readonly publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
  readonly queueReleaseIfEligible: typeof BackgroundSearchQueueService.Service.queueReleaseIfEligible;
  readonly maybeQBitConfig: typeof BackgroundSearchQueueService.Service.maybeQBitConfig;
  readonly requireQualityProfile: typeof BackgroundSearchQualityProfileService.Service.requireQualityProfile;
}

export function makeBackgroundSearchRssSupport(input: BackgroundSearchRssSupportInput) {
  const {
    db,
    eventBus,
    fetchItems,
    queueReleaseIfEligible,
    maybeQBitConfig,
    requireQualityProfile,
    logRssSkip,
    nowIso,
    publishDownloadProgress,
    publishRssCheckProgress,
  } = input;

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
        const items = yield* fetchItems(feed.url).pipe(
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
      Effect.catchTag("DatabaseError", (error) =>
        markJobFailed(db, "rss", error, nowIso).pipe(Effect.zipRight(Effect.fail(error))),
      ),
      Effect.catchAll((cause) =>
        markJobFailed(db, "rss", cause, nowIso).pipe(
          Effect.zipRight(
            Effect.fail(
              new OperationsInfrastructureError({
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

export type SearchBackgroundRssServiceShape = ReturnType<typeof makeBackgroundSearchRssSupport>;

export class SearchBackgroundRssService extends Context.Tag(
  "@bakarr/api/SearchBackgroundRssService",
)<SearchBackgroundRssService, SearchBackgroundRssServiceShape>() {}

export const SearchBackgroundRssServiceLive = Layer.effect(
  SearchBackgroundRssService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const clock = yield* ClockService;
    const progress = yield* OperationsProgress;
    const queueService = yield* BackgroundSearchQueueService;
    const qualityProfileService = yield* BackgroundSearchQualityProfileService;
    const skipLogService = yield* BackgroundSearchSkipLogService;
    const rssRunnerService = yield* BackgroundSearchRssRunnerService;

    const input: BackgroundSearchRssSupportInput = {
      db,
      eventBus,
      fetchItems: rssRunnerService.fetchItems,
      logRssSkip: skipLogService.logRssSkip,
      maybeQBitConfig: queueService.maybeQBitConfig,
      nowIso: () => nowIsoFromClock(clock),
      publishDownloadProgress: progress.publishDownloadProgress,
      publishRssCheckProgress: progress.publishRssCheckProgress,
      queueReleaseIfEligible: queueService.queueReleaseIfEligible,
      requireQualityProfile: qualityProfileService.requireQualityProfile,
    };

    return makeBackgroundSearchRssSupport(input);
  }),
);
