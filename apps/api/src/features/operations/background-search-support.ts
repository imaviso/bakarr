import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { anime, downloads, episodes, rssFeeds } from "../../db/schema.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodes,
  toCoveredEpisodesJson,
} from "./download-lifecycle.ts";
import { ExternalCallError, type OperationsError } from "./errors.ts";
import {
  loadMissingEpisodeNumbers,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
  nowIso,
} from "./job-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import { queueParsedReleaseDownload } from "./release-queue-support.ts";
import {
  decideDownloadAction,
  parseEpisodeFromTitle,
  parseReleaseName,
} from "./release-ranking.ts";
import {
  loadCurrentEpisodeState,
  loadQualityProfile,
  loadReleaseRules,
  loadRuntimeConfig,
  requireAnime,
} from "./repository.ts";
import { type ParsedRelease, RssClient } from "./rss-client.ts";
import type {
  TryDatabasePromise,
  TryOperationsPromise,
} from "./service-support.ts";

export function makeBackgroundSearchSupport(input: {
  db: AppDatabase;
  eventBus: typeof EventBus.Service;
  rssClient: typeof RssClient.Service;
  qbitClient: typeof QBitTorrentClient.Service;
  tryDatabasePromise: TryDatabasePromise;
  tryOperationsPromise: TryOperationsPromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  maybeQBitConfig: (config: Config) => QBitConfig | null;
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
  ) => Effect.Effect<
    readonly ParsedRelease[],
    ExternalCallError | OperationsError | DatabaseError
  >;
  triggerSemaphore: Effect.Semaphore;
}) {
  const {
    db,
    eventBus,
    rssClient,
    qbitClient,
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
    dbError,
    maybeQBitConfig,
    publishDownloadProgress,
    publishRssCheckProgress,
    searchEpisodeReleases,
    triggerSemaphore,
  } = input;

  const queueReleaseIfEligible = Effect.fn(
    "OperationsService.queueReleaseIfEligible",
  )(function* (input: {
    animeRow: typeof anime.$inferSelect;
    contextMessage: string;
    episodeNumber: number;
    eventMessage: string;
    eventType: string;
    item: ParsedRelease;
    missingEpisodes: readonly number[];
    qbitConfig: QBitConfig | null;
    semaphore?: Effect.Semaphore;
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
      const overlapping = yield* tryDatabasePromise(
        input.contextMessage,
        () =>
          hasOverlappingDownload(
            db,
            input.animeRow.id,
            input.item.infoHash,
            parseCoveredEpisodes(coveredEpisodes),
          ),
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
        qbitClient,
        qbitConfig: input.qbitConfig,
        tryDatabasePromise,
        wrapOperationsError,
      });
    });

    return input.semaphore
      ? yield* input.semaphore.withPermits(1)(queueEffect)
      : yield* queueEffect;
  });

  const triggerSearchMissingRaw = Effect.fn(
    "OperationsService.triggerSearchMissing",
  )(function* (animeId?: number) {
    return yield* Effect.gen(function* () {
      const title = animeId
        ? (yield* tryOperationsPromise(
          "Failed to queue missing-episode search",
          () => requireAnime(db, animeId),
        )).titleRomaji
        : "all anime";

      yield* eventBus.publish({
        type: "SearchMissingStarted",
        payload: { anime_id: animeId ?? 0, title },
      });

      const missingConditions = [
        eq(episodes.downloaded, false),
        sql`${episodes.aired} is not null`,
        sql`${episodes.aired} <= ${nowIso()}`,
        animeId ? eq(episodes.animeId, animeId) : eq(anime.monitored, true),
      ];
      const missingRows = yield* tryDatabasePromise(
        "Failed to queue missing-episode search",
        () =>
          db.select().from(episodes).innerJoin(
            anime,
            eq(anime.id, episodes.animeId),
          )
            .where(and(...missingConditions)),
      );
      const runtimeConfig = yield* tryOperationsPromise(
        "Failed to queue missing-episode search",
        () => loadRuntimeConfig(db),
      );
      let queued = 0;

      for (const row of missingRows.slice(0, 10)) {
        const profile = yield* tryDatabasePromise(
          "Failed to queue missing-episode search",
          () => loadQualityProfile(db, row.anime.profileName),
        );

        if (!profile) {
          continue;
        }

        const rules = yield* tryDatabasePromise(
          "Failed to queue missing-episode search",
          () => loadReleaseRules(db, row.anime),
        );
        const currentEpisode = yield* tryDatabasePromise(
          "Failed to queue missing-episode search",
          () => loadCurrentEpisodeState(db, row.anime.id, row.episodes.number),
        );
        const candidates = yield* searchEpisodeReleases(
          row.anime,
          row.episodes.number,
          runtimeConfig,
        );
        const best = candidates
          .map((item) => ({
            action: decideDownloadAction(
              profile,
              rules,
              currentEpisode,
              item,
              runtimeConfig,
            ),
            item,
          }))
          .find((entry) => entry.action.Accept || entry.action.Upgrade);

        if (!best) {
          continue;
        }

        const queueResult = yield* queueReleaseIfEligible({
          animeRow: row.anime,
          contextMessage: "Failed to queue missing-episode search",
          episodeNumber: row.episodes.number,
          eventMessage: `Queued ${best.item.title}`,
          eventType: "download.search_missing.queued",
          item: best.item,
          missingEpisodes: missingRows
            .filter((entry) => entry.anime.id === row.anime.id)
            .map((entry) => entry.episodes.number),
          qbitConfig: maybeQBitConfig(runtimeConfig),
          semaphore: triggerSemaphore,
        });

        if (queueResult._tag === "skipped") {
          continue;
        }

        queued += 1;
      }

      yield* eventBus.publish({
        type: "SearchMissingFinished",
        payload: { anime_id: animeId ?? 0, title, count: queued },
      });
      yield* publishDownloadProgress();
    }).pipe(Effect.withSpan("operations.search.missing"));
  });

  const triggerSearchMissing = (animeId?: number) =>
    triggerSearchMissingRaw(animeId).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : dbError("Failed to queue missing-episode search")(error)
      ),
    );

  const runRssCheckRaw = Effect.fn("OperationsService.runRssCheck")(
    function* () {
      yield* tryDatabasePromise(
        "Failed to run RSS check",
        () => markJobStarted(db, "rss"),
      );

      return yield* Effect.gen(function* () {
        const feeds = yield* tryDatabasePromise(
          "Failed to run RSS check",
          () => db.select().from(rssFeeds).where(eq(rssFeeds.enabled, true)),
        );
        const runtimeConfig = yield* tryOperationsPromise(
          "Failed to run RSS check",
          () => loadRuntimeConfig(db),
        );
        let newItems = 0;

        yield* eventBus.publish({ type: "RssCheckStarted" });

        for (const [index, feed] of feeds.entries()) {
          yield* publishRssCheckProgress({
            current: index + 1,
            total: feeds.length,
            feed_name: feed.name ?? feed.url,
          });

          newItems += yield* Effect.gen(function* () {
            const itemsResult = yield* rssClient.fetchItems(feed.url).pipe(
              Effect.either,
            );

            if (itemsResult._tag === "Left") {
              yield* Effect.logWarning("RSS feed fetch failed, skipping feed")
                .pipe(
                  Effect.annotateLogs({
                    feedName: feed.name ?? feed.url,
                    feedUrl: feed.url,
                    error: String(itemsResult.left),
                  }),
                );
              return 0;
            }

            const items = itemsResult.right;
            const animeRow = yield* tryOperationsPromise(
              "Failed to run RSS check",
              () => requireAnime(db, feed.animeId),
            );

            if (!animeRow.monitored) {
              return 0;
            }

            const profile = yield* tryDatabasePromise(
              "Failed to run RSS check",
              () => loadQualityProfile(db, animeRow.profileName),
            );

            if (!profile) {
              return 0;
            }

            const rules = yield* tryDatabasePromise(
              "Failed to run RSS check",
              () => loadReleaseRules(db, animeRow),
            );
            let queuedForFeed = 0;

            for (const item of items.slice(0, 10)) {
              const exists = yield* tryDatabasePromise(
                "Failed to run RSS check",
                () =>
                  db.select({ id: downloads.id }).from(downloads).where(
                    sql`${downloads.infoHash} = ${item.infoHash}`,
                  ).limit(1),
              );

              if (exists[0]) {
                continue;
              }

              const episodeNumber = parseEpisodeFromTitle(item.title);

              if (episodeNumber == null) {
                continue;
              }

              const currentEpisode = yield* tryDatabasePromise(
                "Failed to run RSS check",
                () => loadCurrentEpisodeState(db, animeRow.id, episodeNumber),
              );
              const action = decideDownloadAction(
                profile,
                rules,
                currentEpisode,
                item,
                runtimeConfig,
              );

              if (!(action.Accept || action.Upgrade)) {
                continue;
              }

              const queueResult = yield* queueReleaseIfEligible({
                animeRow,
                contextMessage: "Failed to run RSS check",
                episodeNumber,
                eventMessage: `Queued ${item.title} from RSS`,
                eventType: "download.rss.queued",
                item,
                missingEpisodes: yield* tryDatabasePromise(
                  "Failed to run RSS check",
                  () => loadMissingEpisodeNumbers(db, animeRow.id),
                ),
                qbitConfig: maybeQBitConfig(runtimeConfig),
              });

              if (queueResult._tag === "skipped") {
                continue;
              }

              queuedForFeed += 1;
            }

            yield* tryDatabasePromise(
              "Failed to run RSS check",
              () =>
                db.update(rssFeeds).set({ lastChecked: nowIso() }).where(
                  eq(rssFeeds.id, feed.id),
                ),
            );

            return queuedForFeed;
          }).pipe(Effect.withSpan("operations.rss.feed"));
        }

        yield* tryDatabasePromise(
          "Failed to run RSS check",
          () => markJobSucceeded(db, "rss", `Queued ${newItems} release(s)`),
        );
        yield* eventBus.publish({
          type: "RssCheckFinished",
          payload: { new_items: newItems, total_feeds: feeds.length },
        });
        yield* publishDownloadProgress();

        return { newItems };
      }).pipe(
        Effect.withSpan("operations.rss.check"),
        Effect.catchAll((cause) =>
          tryDatabasePromise(
            "Failed to run RSS check",
            () => markJobFailed(db, "rss", cause),
          ).pipe(
            Effect.zipRight(
              Effect.fail(dbError("Failed to run RSS check")(cause)),
            ),
          )
        ),
      );
    },
  );

  const runRssCheck = () =>
    runRssCheckRaw().pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : dbError("Failed to run RSS check")(error)
      ),
    );

  return {
    runRssCheck,
    triggerSearchMissing,
  };
}
