import { Effect, Layer } from "effect";

import { CatalogOrchestration, SearchOrchestration } from "./operations-orchestration.ts";
import {
  RssCommandService,
  RssReadService,
  type RssCommandServiceShape,
  type RssReadServiceShape,
} from "./service-contract.ts";

export const RssReadServiceLive = Layer.effect(
  RssReadService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;

    return {
      listAnimeRssFeeds: catalog.listAnimeRssFeeds,
      listRssFeeds: catalog.listRssFeeds,
    } satisfies RssReadServiceShape;
  }),
);

export const RssCommandServiceLive = Layer.effect(
  RssCommandService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;

    return {
      addRssFeed: catalog.addRssFeed,
      deleteRssFeed: catalog.deleteRssFeed,
      runRssCheck: search.runRssCheck,
      toggleRssFeed: catalog.toggleRssFeed,
    } satisfies RssCommandServiceShape;
  }),
);
