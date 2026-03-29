import { Context, Effect, Layer } from "effect";

import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { Database } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { OperationsProgress } from "@/features/operations/download-service-tags.ts";
import { makeBackgroundSearchSupport } from "@/features/operations/background-search-support.ts";
import { OperationsSharedState } from "@/features/operations/runtime-support.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import { maybeQBitConfig } from "@/features/operations/operations-qbit-config.ts";
import { SearchReleaseService } from "@/features/operations/search-release-service.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type SearchBackgroundServiceShape = ReturnType<typeof makeBackgroundSearchSupport>;

export class SearchBackgroundService extends Context.Tag("@bakarr/api/SearchBackgroundService")<
  SearchBackgroundService,
  SearchBackgroundServiceShape
>() {}

export const SearchBackgroundServiceLive = Layer.effect(
  SearchBackgroundService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const qbitClient = yield* QBitTorrentClient;
    const rssClient = yield* RssClient;
    const clock = yield* ClockService;
    const progress = yield* OperationsProgress;
    const sharedState = yield* OperationsSharedState;
    const searchReleaseService = yield* SearchReleaseService;

    return makeBackgroundSearchSupport({
      db,
      coordination: sharedState,
      eventBus,
      maybeQBitConfig,
      nowIso: () => nowIsoFromClock(clock),
      publishDownloadProgress: progress.publishDownloadProgress,
      publishRssCheckProgress: progress.publishRssCheckProgress,
      qbitClient,
      rssClient,
      searchEpisodeReleases: searchReleaseService.searchEpisodeReleases,
      tryDatabasePromise,
    });
  }),
);
