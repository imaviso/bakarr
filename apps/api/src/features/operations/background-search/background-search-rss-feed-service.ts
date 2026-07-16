import { Effect, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { rssFeeds } from "@/db/schema.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { RssClient } from "@/features/operations/rss/rss-client.ts";
import { BackgroundSearchQueueService } from "@/features/operations/background-search/background-search-queue-service.ts";
import { DomainInputError, InfrastructureError } from "@/features/errors.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import {
  decideDownloadAction,
  validateQualityProfileSizeLabels,
} from "@/features/operations/search/release-ranking.ts";
import { parseRssReleaseUnitNumbers } from "@/features/operations/background-search/background-search-rss-release.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { RssFeedRepository } from "@/features/operations/repository/rss-feed-repository-service.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { ReleaseProfileRepository } from "@/features/system/repository/release-profile-repository.ts";

export type BackgroundSearchRssFeedError =
  | DatabaseError
  | InfrastructureError
  | DomainInputError
  | import("@/features/media/errors.ts").MediaNotFoundError
  | import("@/features/system/errors.ts").StoredConfigCorruptError;

export interface BackgroundSearchRssFeedServiceShape {
  readonly processFeed: (
    feed: typeof rssFeeds.$inferSelect,
    runtimeConfig: Config,
  ) => Effect.Effect<number, BackgroundSearchRssFeedError>;
}

export class BackgroundSearchRssFeedService extends Effect.Service<BackgroundSearchRssFeedService>()(
  "@bakarr/api/BackgroundSearchRssFeedService",
  {
    effect: Effect.gen(function* () {
      const rssClient = yield* RssClient;
      const queueService = yield* BackgroundSearchQueueService;
      const mediaReadRepository = yield* MediaReadRepository;
      const qualityProfileRepository = yield* QualityProfileRepository;
      const releaseProfileRepository = yield* ReleaseProfileRepository;
      const rssFeedRepository = yield* RssFeedRepository;
      const downloadRepository = yield* DownloadRepository;
      const nowIso = currentNowIso;

      const requireQualityProfile = Effect.fn("BackgroundSearchRssFeed.requireQualityProfile")(
        function* (profileName: string) {
          const profileOption = yield* qualityProfileRepository.loadQualityProfile(profileName);

          if (Option.isNone(profileOption)) {
            return yield* new DomainInputError({
              message: `Quality profile '${profileName}' not found`,
            });
          }

          return profileOption.value;
        },
      );

      const logRssSkip = Effect.fn("BackgroundSearchRssFeed.logRssSkip")(function* (input: {
        mediaId?: number;
        feedId: number;
        feedName: string;
        reason: string;
      }) {
        yield* Effect.logDebug("Skipping RSS background action").pipe(
          Effect.annotateLogs({
            mediaId: input.mediaId,
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
              : new InfrastructureError({
                  message: `Failed to fetch RSS feed '${feed.name ?? feed.url}'`,
                  cause: error,
                }),
          ),
          Effect.flatMap((items) =>
            Effect.gen(function* () {
              const animeRow = yield* mediaReadRepository.getMediaRow(feed.mediaId);

              if (!animeRow.monitored) {
                yield* logRssSkip({
                  mediaId: animeRow.id,
                  feedId: feed.id,
                  feedName: feed.name ?? feed.url,
                  reason: "media is not monitored",
                });
                return 0;
              }

              const profile = yield* requireQualityProfile(animeRow.profileName);
              yield* validateQualityProfileSizeLabels(profile);
              const rules = yield* releaseProfileRepository.loadReleaseRules(animeRow);
              let queuedForFeed = 0;

              const slice = items.slice(0, 10);
              if (slice.length === 0) {
                yield* logRssSkip({
                  mediaId: animeRow.id,
                  feedId: feed.id,
                  feedName: feed.name ?? feed.url,
                  reason: "feed returned no items",
                });
                const feedCheckedAt = yield* nowIso();
                yield* rssFeedRepository.markLastChecked(feed.id, feedCheckedAt);
                return 0;
              }

              const existingRows = yield* downloadRepository.listDownloadsByInfoHashes(
                slice.map((item) => item.infoHash),
              );
              const existingHashes = new Set(existingRows.map((d) => d.infoHash?.toLowerCase()));
              const missingUnits = yield* downloadRepository.listMissingEpisodeNumbers(animeRow.id);

              for (const item of slice) {
                if (existingHashes.has(item.infoHash.toLowerCase())) {
                  yield* logRssSkip({
                    mediaId: animeRow.id,
                    feedId: feed.id,
                    feedName: feed.name ?? feed.url,
                    reason: `item already queued: ${item.infoHash}`,
                  });
                  continue;
                }

                const unitNumber = parseRssReleaseUnitNumbers({
                  mediaKind: animeRow.mediaKind,
                  title: item.title,
                })[0];

                if (unitNumber == null) {
                  yield* logRssSkip({
                    mediaId: animeRow.id,
                    feedId: feed.id,
                    feedName: feed.name ?? feed.url,
                    reason: `could not parse unit number: ${item.title}`,
                  });
                  continue;
                }

                const currentEpisode = yield* mediaReadRepository.loadCurrentEpisodeState(
                  animeRow.id,
                  unitNumber,
                );
                const action = decideDownloadAction(
                  profile,
                  rules,
                  currentEpisode,
                  item,
                  runtimeConfig,
                  { allowUnknownQuality: animeRow.mediaKind !== "anime" },
                );

                if (!(action.Accept || action.Upgrade)) {
                  yield* logRssSkip({
                    mediaId: animeRow.id,
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
                  ...(decisionReason === undefined ? {} : { decisionReason }),
                  unitNumber,
                  eventMessage: `Queued ${item.title} from RSS`,
                  eventType: "download.rss.queued",
                  item,
                  missingUnits,
                });

                if (queueResult._tag === "skipped") {
                  yield* logRssSkip({
                    mediaId: animeRow.id,
                    feedId: feed.id,
                    feedName: feed.name ?? feed.url,
                    reason: `overlapping download already queued: ${item.infoHash}`,
                  });
                  continue;
                }

                queuedForFeed += 1;
              }

              const feedCheckedAt = yield* nowIso();
              yield* rssFeedRepository.markLastChecked(feed.id, feedCheckedAt);

              return queuedForFeed;
            }),
          ),
        );
      });

      return { processFeed } satisfies BackgroundSearchRssFeedServiceShape;
    }),
    dependencies: [
      MediaReadRepository.Default,
      RssFeedRepository.Default,
      DownloadRepository.Default,
    ],
  },
) {}

export const BackgroundSearchRssFeedServiceLive = BackgroundSearchRssFeedService.Default;
