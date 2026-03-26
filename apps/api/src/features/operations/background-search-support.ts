import { and, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { Config, DownloadAction } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { anime, downloads, episodes, rssFeeds } from "../../db/schema.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
} from "./download-lifecycle.ts";
import { ExternalCallError, type OperationsError, OperationsInputError } from "./errors.ts";
import {
  loadMissingEpisodeNumbers,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
} from "./job-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import { queueParsedReleaseDownload } from "./release-queue-support.ts";
import {
  decideDownloadAction,
  parseEpisodeFromTitle,
  parseReleaseName,
} from "./release-ranking.ts";
import {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "./naming-support.ts";
import {
  loadCurrentEpisodeState,
  loadQualityProfile,
  loadReleaseRules,
  loadRuntimeConfig,
  requireAnime,
} from "./repository.ts";
import { type ParsedRelease, RssClient } from "./rss-client.ts";
import type { OperationsCoordinationShape } from "./runtime-support.ts";
import type { TryDatabasePromise } from "./service-support.ts";

export function makeBackgroundSearchSupport(input: {
  db: AppDatabase;
  eventBus: typeof EventBus.Service;
  rssClient: typeof RssClient.Service;
  qbitClient: typeof QBitTorrentClient.Service;
  tryDatabasePromise: TryDatabasePromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  maybeQBitConfig: (config: Config) => QBitConfig | null;
  nowIso: () => Effect.Effect<string>;
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
  coordination: OperationsCoordinationShape;
}) {
  const {
    db,
    eventBus,
    rssClient,
    qbitClient,
    tryDatabasePromise,
    wrapOperationsError,
    dbError,
    maybeQBitConfig,
    publishDownloadProgress,
    publishRssCheckProgress,
    searchEpisodeReleases,
    coordination,
  } = input;
  const { nowIso } = input;

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

  const queueReleaseIfEligible = Effect.fn("OperationsService.queueReleaseIfEligible")(
    function* (input: {
      animeRow: typeof anime.$inferSelect;
      contextMessage: string;
      decisionReason?: string;
      action?: DownloadAction;
      episodeNumber: number;
      eventMessage: string;
      eventType: string;
      item: ParsedRelease;
      missingEpisodes: readonly number[];
      qbitConfig: QBitConfig | null;
    }) {
      const parsedRelease = parseReleaseName(input.item.title);
      const coveredEpisodes = toCoveredEpisodesJson(
        inferCoveredEpisodeNumbers({
          explicitEpisodes: parsedRelease.episodeNumbers,
          isBatch: parsedRelease.isBatch,
          totalEpisodes: input.animeRow.episodeCount,
          missingEpisodes: input.missingEpisodes,
          requestedEpisode: input.episodeNumber,
        }),
      );

      const queueEffect = Effect.gen(function* () {
        const parsedCoveredEpisodes = yield* parseCoveredEpisodesEffect(coveredEpisodes);
        const overlapping = yield* hasOverlappingDownload(
          db,
          input.animeRow.id,
          input.item.infoHash,
          parsedCoveredEpisodes,
        );

        if (overlapping) {
          return { _tag: "skipped" } as const;
        }

        return yield* queueParsedReleaseDownload({
          animeRow: input.animeRow,
          contextMessage: input.contextMessage,
          coveredEpisodes,
          db,
          episodeNumber: input.episodeNumber,
          eventMessage: input.eventMessage,
          eventType: input.eventType,
          isBatch: parsedRelease.isBatch,
          item: input.item,
          nowIso,
          sourceMetadata: mergeDownloadSourceMetadata(
            buildDownloadSourceMetadataFromRelease({
              ...buildDownloadSelectionMetadata(input.action),
              decisionReason: input.decisionReason,
              group: input.item.group,
              indexer: "Nyaa",
              isSeadex: input.item.isSeaDex,
              isSeadexBest: input.item.isSeaDexBest,
              remake: input.item.remake,
              seadexComparison: input.item.seaDexComparison,
              seadexDualAudio: input.item.seaDexDualAudio,
              seadexNotes: input.item.seaDexNotes,
              seadexReleaseGroup: input.item.seaDexReleaseGroup,
              seadexTags: input.item.seaDexTags,
              sourceUrl: input.item.viewUrl,
              title: input.item.title,
              trusted: input.item.trusted,
            }),
          ),
          qbitClient,
          qbitConfig: input.qbitConfig,
          tryDatabasePromise,
          wrapOperationsError,
        });
      });

      return yield* coordination.runExclusiveDownloadTrigger(queueEffect);
    },
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

  const triggerSearchMissingBase = Effect.fn("operations.search.missing")(function* (
    animeId?: number,
  ) {
    const title = animeId ? (yield* requireAnime(db, animeId)).titleRomaji : "all anime";

    yield* eventBus.publish({
      type: "SearchMissingStarted",
      payload: { anime_id: animeId ?? 0, title },
    });

    const now = yield* nowIso();
    const missingConditions = [
      eq(episodes.downloaded, false),
      sql`${episodes.aired} is not null`,
      sql`${episodes.aired} <= ${now}`,
      animeId ? eq(episodes.animeId, animeId) : eq(anime.monitored, true),
    ];
    const missingRows = yield* tryDatabasePromise("Failed to queue missing-episode search", () =>
      db
        .select()
        .from(episodes)
        .innerJoin(anime, eq(anime.id, episodes.animeId))
        .where(and(...missingConditions)),
    );
    const runtimeConfig = yield* loadRuntimeConfig(db);
    let queued = 0;

    for (const row of missingRows.slice(0, 10)) {
      const profile = yield* requireQualityProfile(row.anime.profileName);

      const rules = yield* loadReleaseRules(db, row.anime);
      const currentEpisode = yield* loadCurrentEpisodeState(db, row.anime.id, row.episodes.number);
      const candidates = yield* searchEpisodeReleases(
        row.anime,
        row.episodes.number,
        runtimeConfig,
      );
      const best = candidates
        .map((item) => ({
          action: decideDownloadAction(profile, rules, currentEpisode, item, runtimeConfig),
          item,
        }))
        .find((entry) => entry.action.Accept || entry.action.Upgrade);

      if (!best) {
        yield* logSearchMissingSkip({
          animeId: row.anime.id,
          episodeNumber: row.episodes.number,
          reason: "no acceptable release candidates",
        });
        continue;
      }

      const queueResult = yield* queueReleaseIfEligible({
        action: best.action,
        animeRow: row.anime,
        contextMessage: "Failed to queue missing-episode search",
        decisionReason:
          best.action.Upgrade?.reason ??
          (best.action.Accept
            ? `Accepted (${best.action.Accept.quality.name}, score ${best.action.Accept.score})`
            : undefined),
        episodeNumber: row.episodes.number,
        eventMessage: `Queued ${best.item.title}`,
        eventType: "download.search_missing.queued",
        item: best.item,
        missingEpisodes: missingRows
          .filter((entry) => entry.anime.id === row.anime.id)
          .map((entry) => entry.episodes.number),
        qbitConfig: maybeQBitConfig(runtimeConfig),
      });

      if (queueResult._tag === "skipped") {
        yield* logSearchMissingSkip({
          animeId: row.anime.id,
          episodeNumber: row.episodes.number,
          reason: "overlapping download already queued",
        });
        continue;
      }

      queued += 1;
    }

    yield* eventBus.publish({
      type: "SearchMissingFinished",
      payload: { anime_id: animeId ?? 0, title, count: queued },
    });
    yield* publishDownloadProgress();
  });

  const triggerSearchMissing = Effect.fn("OperationsService.triggerSearchMissing")(function* (
    animeId?: number,
  ) {
    return yield* triggerSearchMissingBase(animeId).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : dbError("Failed to queue missing-episode search")(error),
      ),
    );
  });

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
        const items = yield* rssClient
          .fetchItems(feed.url)
          .pipe(
            Effect.mapError((error) =>
              wrapOperationsError(`Failed to fetch RSS feed '${feed.name ?? feed.url}'`)(error),
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
          Effect.zipRight(Effect.fail(dbError("Failed to run RSS check")(cause))),
        ),
      ),
    );
  });

  const runRssCheck = Effect.fn("OperationsService.runRssCheck")(function* () {
    return yield* runRssCheckBase().pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError ? error : dbError("Failed to run RSS check")(error),
      ),
    );
  });

  return {
    runRssCheck,
    triggerSearchMissing,
  };
}
