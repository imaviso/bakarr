import { Effect } from "effect";

import type { RssFeed } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { RssFeedRepository } from "@/features/operations/repository/rss-feed-repository-service.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";

export interface CatalogRssServiceShape {
  readonly listRssFeeds: () => Effect.Effect<RssFeed[], DatabaseError>;
  readonly listMediaRssFeeds: (mediaId: number) => Effect.Effect<RssFeed[], DatabaseError>;
  readonly addRssFeed: (input: {
    media_id: number;
    url: string;
    name?: string;
  }) => Effect.Effect<RssFeed, DatabaseError | MediaNotFoundError>;
  readonly deleteRssFeed: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly toggleRssFeed: (id: number, enabled: boolean) => Effect.Effect<void, DatabaseError>;
}

export class CatalogRssService extends Effect.Service<CatalogRssService>()(
  "@bakarr/api/CatalogRssService",
  {
    effect: Effect.gen(function* () {
      const mediaReadRepository = yield* MediaReadRepository;
      const rssFeedRepository = yield* RssFeedRepository;
      const systemLogRepository = yield* SystemLogRepository;
      const nowIso = currentNowIso;

      const listRssFeeds = Effect.fn("CatalogRssService.listRssFeeds")(function* () {
        return yield* rssFeedRepository.listAll();
      });

      const listMediaRssFeeds = Effect.fn("CatalogRssService.listMediaRssFeeds")(function* (
        mediaId: number,
      ) {
        return yield* rssFeedRepository.listByMediaId(mediaId);
      });

      const addRssFeed = Effect.fn("CatalogRssService.addRssFeed")(function* (rssInput: {
        media_id: number;
        url: string;
        name?: string;
      }) {
        yield* mediaReadRepository.getMediaRow(rssInput.media_id);
        const now = yield* nowIso();
        const feed = yield* rssFeedRepository.insertFeed({
          createdAt: now,
          mediaId: rssInput.media_id,
          name: rssInput.name ?? null,
          url: rssInput.url,
        });

        yield* systemLogRepository.appendLog(
          "rss.created",
          "success",
          `RSS feed added for media ${rssInput.media_id}`,
          nowIso,
        );

        return feed;
      });

      const deleteRssFeed = Effect.fn("CatalogRssService.deleteRssFeed")(function* (id: number) {
        yield* rssFeedRepository.deleteById(id);
      });

      const toggleRssFeed = Effect.fn("CatalogRssService.toggleRssFeed")(function* (
        id: number,
        enabled: boolean,
      ) {
        yield* rssFeedRepository.setEnabled(id, enabled);
      });

      return {
        addRssFeed,
        deleteRssFeed,
        listMediaRssFeeds,
        listRssFeeds,
        toggleRssFeed,
      } satisfies CatalogRssServiceShape;
    }),
    dependencies: [
      MediaReadRepository.Default,
      RssFeedRepository.Default,
      SystemLogRepository.Default,
    ],
  },
) {}

export const CatalogRssServiceLive = CatalogRssService.Default;
