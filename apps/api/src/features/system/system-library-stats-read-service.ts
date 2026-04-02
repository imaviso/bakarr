import { Context, Effect, Layer } from "effect";

import type { LibraryStats } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { loadSystemLibraryStatsAggregate } from "@/features/system/repository/stats-repository.ts";

export interface SystemLibraryStatsReadServiceShape {
  readonly getLibraryStats: () => Effect.Effect<LibraryStats, DatabaseError>;
}

export class SystemLibraryStatsReadService extends Context.Tag(
  "@bakarr/api/SystemLibraryStatsReadService",
)<SystemLibraryStatsReadService, SystemLibraryStatsReadServiceShape>() {}

export const SystemLibraryStatsReadServiceLive = Layer.effect(
  SystemLibraryStatsReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;

    const getLibraryStats = Effect.fn("SystemLibraryStatsReadService.getLibraryStats")(
      function* () {
        const aggregate = yield* loadSystemLibraryStatsAggregate(db);

        return {
          downloaded_episodes: aggregate.downloadedEpisodes,
          downloaded_percent:
            aggregate.totalEpisodes > 0
              ? Math.min(
                  100,
                  Math.round((aggregate.downloadedEpisodes / aggregate.totalEpisodes) * 100),
                )
              : 0,
          missing_episodes: Math.max(aggregate.totalEpisodes - aggregate.downloadedEpisodes, 0),
          monitored_anime: aggregate.monitoredAnime,
          recent_downloads: aggregate.completedDownloads,
          rss_feeds: aggregate.totalRssFeeds,
          total_anime: aggregate.totalAnime,
          total_episodes: aggregate.totalEpisodes,
          up_to_date_anime: aggregate.upToDateAnime,
        } satisfies LibraryStats;
      },
    );

    return SystemLibraryStatsReadService.of({ getLibraryStats });
  }),
);
