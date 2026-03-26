import { Effect, Layer } from "effect";

import { CatalogOrchestration, SearchOrchestration } from "./operations-orchestration.ts";
import { RssService, type RssServiceShape } from "./service-contract.ts";

export const RssServiceLive = Layer.effect(
  RssService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;

    return {
      addRssFeed: catalog.addRssFeed,
      deleteRssFeed: catalog.deleteRssFeed,
      listAnimeRssFeeds: catalog.listAnimeRssFeeds,
      listRssFeeds: catalog.listRssFeeds,
      runRssCheck: search.runRssCheck,
      toggleRssFeed: catalog.toggleRssFeed,
    } satisfies RssServiceShape;
  }),
);
