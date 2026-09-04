import { DatabaseError } from "@/db/database.ts";
import { BackgroundSearchRssFeedService } from "@/features/operations/background-search/background-search-rss-feed-service.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { RssFeedRepository } from "@/features/operations/repository/rss-feed-repository.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { Context, Effect, Layer, Ref, Result } from "effect";

export interface SearchBackgroundRssServiceShape {
  readonly runRssCheck: () => Effect.Effect<
    { readonly newItems: number; readonly totalFeeds: number },
    DatabaseError | InfrastructureError | ExternalCallError
  >;
}

export class SearchBackgroundRssService extends Context.Service<
  SearchBackgroundRssService,
  SearchBackgroundRssServiceShape
>()("@bakarr/api/SearchBackgroundRssService") {
  static readonly layer = Layer.effect(
    SearchBackgroundRssService,
    Effect.gen(function* () {
      const progress = yield* OperationsProgress;
      const rssFeedService = yield* BackgroundSearchRssFeedService;
      const rssFeedRepository = yield* RssFeedRepository;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

      const runRssCheck = Effect.fn("BackgroundSearchRss.runRssCheck")(function* () {
        return yield* Effect.gen(function* () {
          const feeds = yield* rssFeedRepository.listEnabledRows();
          const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
          const startedFeedsRef = yield* Ref.make(0);

          const processRssFeed = Effect.fn("operations.rss.feed")(function* (
            feed: (typeof feeds)[number],
          ) {
            const current = yield* Ref.modify(startedFeedsRef, (value) => [value + 1, value + 1]);
            yield* progress.publishRssCheckProgress({
              current,
              total: feeds.length,
              feed_name: feed.name ?? feed.url,
            });

            return yield* rssFeedService.processFeed(feed, runtimeConfig);
          });

          const feedResults = yield* Effect.forEach(
            feeds,
            (feed) =>
              processRssFeed(feed).pipe(
                Effect.tapError((error) =>
                  Effect.logWarning("RSS feed check failed; continuing with remaining feeds").pipe(
                    Effect.annotateLogs({
                      error: globalThis.String(error),
                      feedId: feed.id,
                      feedName: feed.name ?? feed.url,
                    }),
                  ),
                ),
                Effect.result,
              ),
            { concurrency: 4 },
          );

          const failedCount = feedResults.filter(Result.isFailure).length;
          if (feeds.length > 0 && failedCount === feeds.length) {
            return yield* new InfrastructureError({
              message: "All RSS feeds failed to process",
              cause: feedResults.find(Result.isFailure)?.failure,
            });
          }

          const newItems = feedResults.reduce(
            (total, result) => (Result.isSuccess(result) ? total + result.success : total),
            0,
          );

          const result: { readonly newItems: number; readonly totalFeeds: number } = {
            newItems,
            totalFeeds: feeds.length,
          };

          return result;
        }).pipe(
          Effect.withSpan("operations.rss.check"),
          Effect.mapError((error) =>
            error instanceof DatabaseError ||
            error instanceof ExternalCallError ||
            error instanceof InfrastructureError
              ? error
              : new InfrastructureError({
                  message: "Failed to run RSS check",
                  cause: error,
                }),
          ),
          Effect.catchDefect((defect) =>
            Effect.fail(
              new InfrastructureError({
                message: "Failed to run RSS check",
                cause: defect,
              }),
            ),
          ),
        );
      });

      return { runRssCheck } satisfies SearchBackgroundRssServiceShape;
    }),
  );
}

export const SearchBackgroundRssServiceLive = SearchBackgroundRssService.layer;
