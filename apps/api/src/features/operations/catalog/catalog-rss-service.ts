import { Effect } from "effect";

import type { RssFeed } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { RssFeedRepository } from "@/features/operations/repository/rss-feed-repository-service.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";

/** Multi-repo RSS create only — list/delete/toggle use RssFeedRepository. */
export interface CatalogRssServiceShape {
  readonly addRssFeed: (input: {
    media_id: number;
    url: string;
    name?: string;
  }) => Effect.Effect<RssFeed, DatabaseError | MediaNotFoundError>;
}

export class CatalogRssService extends Effect.Service<CatalogRssService>()(
  "@bakarr/api/CatalogRssService",
  {
    effect: Effect.gen(function* () {
      const mediaRepository = yield* MediaRepository;
      const rssFeedRepository = yield* RssFeedRepository;
      const systemLogRepository = yield* SystemLogRepository;
      const nowIso = currentNowIso;

      const addRssFeed = Effect.fn("CatalogRssService.addRssFeed")(function* (rssInput: {
        media_id: number;
        url: string;
        name?: string;
      }) {
        yield* mediaRepository.getMediaRow(rssInput.media_id);
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

      return {
        addRssFeed,
      } satisfies CatalogRssServiceShape;
    }),
    dependencies: [MediaRepository.Default, RssFeedRepository.Default, SystemLogRepository.Default],
  },
) {}

export const CatalogRssServiceLive = CatalogRssService.Default;
